import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 60;

fal.config({ credentials: process.env.FAL_KEY });

const MODEL_ID = "fal-ai/flux-2/klein/4b/edit";
const MAX_PROMPT_CHARS = 500;
const MAX_SKETCH_CHARS = 500_000; // ~375KB base64 → ~280KB raw PNG, plenty for a 1024² line-art sketch

type GenerateResponse =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string };

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const sketchDataUrl = typeof body?.sketchDataUrl === "string" ? body.sketchDataUrl : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";

    if (!sketchDataUrl.startsWith("data:image/png;base64,")) {
      return json<GenerateResponse>({ ok: false, error: "Invalid sketch" }, 400);
    }
    if (sketchDataUrl.length > MAX_SKETCH_CHARS) {
      return json<GenerateResponse>({ ok: false, error: "Sketch too large" }, 413);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json<GenerateResponse>({ ok: false, error: "Prompt too long" }, 400);
    }

    // Convert data URI → Blob → upload to FAL storage → pass URL to model.
    // This is more reliable than inline data URIs across FAL endpoints.
    const base64 = sketchDataUrl.slice("data:image/png;base64,".length);
    const buffer = Buffer.from(base64, "base64");
    const blob = new Blob([buffer], { type: "image/png" });
    const sketchUrl = await fal.storage.upload(blob);

    const result = await fal.subscribe(MODEL_ID, {
      input: {
        prompt: prompt.trim() || "turn this sketch into a detailed, polished illustration",
        image_urls: [sketchUrl],
      },
      logs: false,
    });

    const imageUrl = result?.data?.images?.[0]?.url;
    if (!imageUrl) {
      return json<GenerateResponse>({ ok: false, error: "Model returned no image" }, 502);
    }
    return json<GenerateResponse>({ ok: true, imageUrl }, 200);
  } catch (err: unknown) {
    // Log the message only — never the raw error object, to avoid leaking
    // credentials or request IDs from FAL error bodies into server logs.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("FAL generate failed:", msg);
    return json<GenerateResponse>(
      { ok: false, error: "Generation failed — please try again" },
      502,
    );
  }
}

function json<T>(payload: T, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
