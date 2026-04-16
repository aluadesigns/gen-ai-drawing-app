"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/DrawingCanvas";

type Status = "idle" | "loading" | "error";

export default function Home() {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  const handleStrokesChange = useCallback((next: boolean) => {
    setHasStrokes(next);
  }, []);

  const canGenerate = hasStrokes && status !== "loading";

  const handleGenerate = async () => {
    if (!canvasRef.current || status === "loading") return;
    const sketchDataUrl = canvasRef.current.exportPng();
    if (!sketchDataUrl) return;

    setStatus("loading");
    setErrorMessage(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketchDataUrl, prompt }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (data.ok && typeof data.imageUrl === "string") {
        setImageUrl(data.imageUrl);
        setStatus("idle");
      } else {
        setErrorMessage(data.error ?? "Generation failed");
        setStatus("error");
      }
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      setErrorMessage(
        isAbort
          ? "Request timed out — try again"
          : "Network error — check your connection and try again",
      );
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">Drawing → AI</h1>
        <p className="text-sm text-neutral-600">
          Sketch something, describe what it should become, and let FAL turn it into an image.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: canvas panel */}
        <section className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <DrawingCanvas ref={canvasRef} onStrokesChange={handleStrokesChange} />
        </section>

        {/* Right: AI output panel */}
        <section className="flex min-h-[560px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4">
          <OutputPanel status={status} imageUrl={imageUrl} errorMessage={errorMessage} />
        </section>
      </div>

      {/* Bottom row: prompt + Generate */}
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          placeholder="Describe your sketch… (e.g., 'a dragon in watercolor')"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={
            canGenerate
              ? "rounded-lg bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              : "cursor-not-allowed rounded-lg bg-neutral-300 px-6 py-2 text-sm font-medium text-neutral-500"
          }
        >
          {status === "loading" ? "Generating…" : "Generate"}
        </button>
      </div>

      <footer className="text-xs text-neutral-500">
        Powered by FAL · FLUX img2img
      </footer>
    </main>
  );
}

function OutputPanel({
  status,
  imageUrl,
  errorMessage,
}: {
  status: Status;
  imageUrl: string | null;
  errorMessage: string | null;
}) {
  if (!imageUrl && status !== "loading" && status !== "error") {
    return (
      <p className="text-center text-sm italic text-neutral-400">
        Your generation will appear here
      </p>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        {imageUrl && (
          <Image
            src={imageUrl}
            alt="Previous generation"
            width={512}
            height={512}
            className="max-h-[480px] w-auto rounded opacity-50"
            unoptimized
          />
        )}
        <p className="text-sm text-red-600">{errorMessage ?? "Something went wrong"}</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="relative flex items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="Previous generation"
            width={512}
            height={512}
            className="max-h-[480px] w-auto rounded opacity-40"
            unoptimized
          />
        ) : null}
        <div className="absolute flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-xs text-neutral-600">Generating…</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={imageUrl!}
      alt="AI-generated image"
      width={512}
      height={512}
      className="max-h-[480px] w-auto rounded"
      unoptimized
    />
  );
}
