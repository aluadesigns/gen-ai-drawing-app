import { supabase, DRAWINGS_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

const NANOID_ID = /^[A-Za-z0-9_-]{21}$/;

type StrokePoint = [number, number, number];
type Stroke = { points: StrokePoint[]; size: number };

type LoadResponse =
  | { ok: true; strokes: Stroke[]; prompt: string; imageUrl: string }
  | { ok: false; error: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;

    if (!NANOID_ID.test(id)) {
      return json<LoadResponse>({ ok: false, error: "Invalid drawing id" }, 400);
    }

    const { data, error } = await supabase
      .from("drawings")
      .select("strokes, prompt, image_path")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Supabase load failed:", error.message);
      return json<LoadResponse>({ ok: false, error: "Load failed — please try again" }, 502);
    }
    if (!data) {
      return json<LoadResponse>({ ok: false, error: "Drawing not found" }, 404);
    }

    const { data: pub } = supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(data.image_path);

    return json<LoadResponse>(
      {
        ok: true,
        strokes: data.strokes as Stroke[],
        prompt: data.prompt ?? "",
        imageUrl: pub.publicUrl,
      },
      200,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Load drawing failed:", msg);
    return json<LoadResponse>({ ok: false, error: "Load failed — please try again" }, 502);
  }
}

function json<T>(payload: T, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
