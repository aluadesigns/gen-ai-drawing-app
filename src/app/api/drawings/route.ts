import { nanoid } from "nanoid";
import { getSupabase, DRAWINGS_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_STROKES_CHARS = 500_000;
const MAX_STROKES_COUNT = 5_000;
const MAX_POINTS_PER_STROKE = 10_000;
const MAX_PROMPT_CHARS = 500;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Hostname allowlist for server-side image fetch. Blocks SSRF — an attacker
// can't ask the server to fetch http://169.254.169.254/… or arbitrary internal URLs.
// The project's own Supabase host is included so already-saved pairs (whose
// imageUrl is a Supabase Storage URL) can be re-saved after edits.
const SUPABASE_HOSTNAME = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

type StrokePoint = [number, number, number];
type Stroke = { points: StrokePoint[]; size: number };

type SaveResponse = { ok: true; id: string } | { ok: false; error: string };

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") {
      return json<SaveResponse>({ ok: false, error: "Invalid request" }, 400);
    }

    const { strokes, prompt, generatedImageUrl } = body as Record<string, unknown>;

    if (!validateStrokes(strokes)) {
      return json<SaveResponse>({ ok: false, error: "Invalid drawing" }, 400);
    }
    const strokesJson = JSON.stringify(strokes);
    if (strokesJson.length > MAX_STROKES_CHARS) {
      return json<SaveResponse>({ ok: false, error: "Drawing too large" }, 413);
    }

    const promptText = typeof prompt === "string" ? prompt : "";
    if (promptText.length > MAX_PROMPT_CHARS) {
      return json<SaveResponse>({ ok: false, error: "Prompt too long" }, 400);
    }

    if (typeof generatedImageUrl !== "string" || !isAllowedImageUrl(generatedImageUrl)) {
      return json<SaveResponse>({ ok: false, error: "Invalid image URL" }, 400);
    }

    const imageRes = await fetch(generatedImageUrl);
    if (!imageRes.ok) {
      return json<SaveResponse>({ ok: false, error: "Couldn't fetch image" }, 502);
    }
    const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
    if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
      return json<SaveResponse>({ ok: false, error: "Image too large" }, 413);
    }

    const id = nanoid();
    const objectKey = `${id}.png`;
    const supabase = getSupabase();

    const { error: uploadError } = await supabase.storage
      .from(DRAWINGS_BUCKET)
      .upload(objectKey, imageBytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      console.error("Supabase upload failed:", uploadError.message);
      return json<SaveResponse>({ ok: false, error: "Save failed — please try again" }, 502);
    }

    const { error: insertError } = await supabase
      .from("drawings")
      .insert({ id, strokes: strokes as Stroke[], prompt: promptText, image_path: objectKey });
    if (insertError) {
      console.error("Supabase insert failed:", insertError.message);
      // Best-effort orphan cleanup. Don't fail the request if cleanup also fails.
      const { error: removeError } = await supabase.storage
        .from(DRAWINGS_BUCKET)
        .remove([objectKey]);
      if (removeError) {
        console.error("Orphan storage cleanup failed:", removeError.message);
      }
      return json<SaveResponse>({ ok: false, error: "Save failed — please try again" }, 502);
    }

    return json<SaveResponse>({ ok: true, id }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Save drawing failed:", msg);
    return json<SaveResponse>({ ok: false, error: "Save failed — please try again" }, 502);
  }
}

function validateStrokes(value: unknown): value is Stroke[] {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_STROKES_COUNT) return false;
  for (const stroke of value) {
    if (!stroke || typeof stroke !== "object") return false;
    const { points, size } = stroke as Record<string, unknown>;
    if (typeof size !== "number" || !Number.isFinite(size)) return false;
    if (!Array.isArray(points)) return false;
    if (points.length > MAX_POINTS_PER_STROKE) return false;
    for (const p of points) {
      if (!Array.isArray(p) || p.length !== 3) return false;
      if (typeof p[0] !== "number" || typeof p[1] !== "number" || typeof p[2] !== "number") {
        return false;
      }
    }
  }
  return true;
}

function isAllowedImageUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  if (host === "fal.media" || host.endsWith(".fal.media")) return true;
  if (host === "fal.ai" || host.endsWith(".fal.ai")) return true;
  if (SUPABASE_HOSTNAME && host === SUPABASE_HOSTNAME) return true;
  return false;
}

function json<T>(payload: T, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
