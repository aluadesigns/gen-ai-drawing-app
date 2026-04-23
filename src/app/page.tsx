"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  DrawingCanvas,
  type DrawingCanvasHandle,
  type Stroke,
} from "@/components/DrawingCanvas";

type Status = "idle" | "loading" | "error";
type LoadState = "pending" | "ready" | "not-found" | "error";
type SaveStatus = "idle" | "saving" | "error";

export default function Home() {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Default "ready" — under SSR, window isn't visible anyway, and the effect
  // below flips to "pending" on the client when ?d=<id> is present.
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [initialStrokes, setInitialStrokes] = useState<Stroke[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("d");
    if (!id) return;
    // Sync from URL (external source) to component state — the pending flag
    // gates canvas mount so initialStrokes only lands on the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadState("pending");
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/drawings/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && Array.isArray(data.strokes) && typeof data.imageUrl === "string") {
          setInitialStrokes(data.strokes);
          setPrompt(typeof data.prompt === "string" ? data.prompt : "");
          setImageUrl(data.imageUrl);
          setLoadState("ready");
        } else if (res.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStrokesChange = useCallback((next: boolean) => {
    setHasStrokes(next);
  }, []);

  const canvasReady = loadState !== "pending";
  const canGenerate = hasStrokes && status !== "loading" && canvasReady;
  const canSave =
    hasStrokes &&
    imageUrl !== null &&
    canvasReady &&
    saveStatus !== "saving" &&
    status !== "loading";

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

  const handleSave = async () => {
    if (!canvasRef.current || !canSave || imageUrl === null) return;
    const strokes = canvasRef.current.getStrokes();

    setSaveStatus("saving");
    setSaveError(null);

    try {
      const res = await fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes, prompt, generatedImageUrl: imageUrl }),
      });
      const data = await res.json();
      if (data.ok && typeof data.id === "string") {
        window.history.replaceState(null, "", `/?d=${encodeURIComponent(data.id)}`);
        setSaveStatus("idle");
      } else {
        setSaveError(data.error ?? "Save failed — please try again");
        setSaveStatus("error");
      }
    } catch {
      setSaveError("Network error — check your connection and try again");
      setSaveStatus("error");
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

      {loadState === "not-found" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          We couldn&apos;t find that drawing — starting with a blank canvas.
        </p>
      )}
      {loadState === "error" && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn&apos;t load that drawing — please try again.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: canvas panel */}
        <section className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          {loadState === "pending" ? (
            <CanvasPlaceholder label="Loading drawing…" />
          ) : (
            <DrawingCanvas
              ref={canvasRef}
              onStrokesChange={handleStrokesChange}
              initialStrokes={initialStrokes}
            />
          )}
        </section>

        {/* Right: AI output panel */}
        <section className="flex min-h-[560px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4">
          {loadState === "pending" ? (
            <p className="text-sm italic text-neutral-400">Loading…</p>
          ) : (
            <OutputPanel status={status} imageUrl={imageUrl} errorMessage={errorMessage} />
          )}
        </section>
      </div>

      {/* Bottom row: prompt + Generate + Save */}
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
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          title={
            !hasStrokes
              ? "Draw something first"
              : imageUrl === null
                ? "Generate an image first"
                : "Save this drawing + image as a shareable URL"
          }
          className={
            canSave
              ? "rounded-lg border border-neutral-900 bg-white px-6 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
              : "cursor-not-allowed rounded-lg border border-neutral-300 bg-white px-6 py-2 text-sm font-medium text-neutral-400"
          }
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
      </div>

      {saveError && (
        <p className="text-right text-xs text-red-600">{saveError}</p>
      )}

      <footer className="text-xs text-neutral-500">
        Powered by FAL · FLUX.2 [klein] 4B Edit
      </footer>
    </main>
  );
}

function CanvasPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-[512px] w-[512px] items-center justify-center rounded-lg border border-neutral-300 bg-[#FAFAFA] text-sm italic text-neutral-400">
      {label}
    </div>
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
