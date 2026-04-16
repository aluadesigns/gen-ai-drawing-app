"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getStroke } from "perfect-freehand";

type StrokePoint = [x: number, y: number, pressure: number];
type Stroke = { points: StrokePoint[]; size: number };

export type DrawingCanvasHandle = {
  exportPng: () => string;
};

type Props = {
  onStrokesChange?: (hasStrokes: boolean) => void;
};

// Display dimensions (CSS px). Export is always 1024×1024 regardless.
const CSS_SIZE = 512;
const EXPORT_SIZE = 1024;
const SCALE = EXPORT_SIZE / CSS_SIZE;

const BRUSH_PRESETS = [
  { key: "S", label: "Small", size: 4 },
  { key: "M", label: "Medium", size: 8 },
  { key: "L", label: "Large", size: 16 },
] as const;

// Pinned options so brush size presets produce consistent uniform strokes.
// simulatePressure: false disables velocity-based width fabrication on mouse input.
const STROKE_OPTS = {
  thinning: 0,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
} as const;

// Convert perfect-freehand outline points to an SVG path `d` string.
// Shared between display and export so geometry is identical in both.
function outlineToSvgPath(points: number[][]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  return d + " Z";
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvas({ onStrokesChange }, ref) {
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [inProgress, setInProgress] = useState<Stroke | null>(null);
    const [brushSize, setBrushSize] = useState<number>(8);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Notify parent whenever the number of committed strokes changes,
    // so it can enable/disable the Generate button.
    useEffect(() => {
      onStrokesChange?.(strokes.length > 0);
    }, [strokes.length, onStrokesChange]);

    // Single-level undo via Cmd/Ctrl+Z. Guarded so we don't steal
    // undo from the prompt <input> when it's focused.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.key.toLowerCase() !== "z") return;
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setStrokes((s) => (s.length ? s.slice(0, -1) : s));
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    const getLocalCoords = (e: ReactPointerEvent<SVGSVGElement>): [number, number] => {
      const rect = e.currentTarget.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const [x, y] = getLocalCoords(e);
      setInProgress({
        points: [[x, y, e.pressure || 0.5]],
        size: brushSize,
      });
    };

    const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!inProgress) return;
      const [x, y] = getLocalCoords(e);
      setInProgress({
        ...inProgress,
        points: [...inProgress.points, [x, y, e.pressure || 0.5]],
      });
    };

    const handlePointerUp = () => {
      if (!inProgress) return;
      setStrokes((s) => [...s, inProgress]);
      setInProgress(null);
    };

    const handleClear = () => {
      setStrokes([]);
      setInProgress(null);
    };

    const exportPng = useCallback((): string => {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";

      // Opaque white background — img2img endpoints behave badly with transparent PNGs.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

      ctx.fillStyle = "#000000";
      for (const stroke of strokes) {
        const scaledPoints = stroke.points.map(
          ([x, y, p]) => [x * SCALE, y * SCALE, p] as StrokePoint,
        );
        const outline = getStroke(scaledPoints, {
          size: stroke.size * SCALE,
          ...STROKE_OPTS,
        });
        const d = outlineToSvgPath(outline);
        if (d) ctx.fill(new Path2D(d));
      }
      return canvas.toDataURL("image/png");
    }, [strokes]);

    useImperativeHandle(ref, () => ({ exportPng }), [exportPng]);

    // Build all stroke paths for display.
    const renderStroke = (stroke: Stroke, key: string) => {
      const outline = getStroke(stroke.points, { size: stroke.size, ...STROKE_OPTS });
      const d = outlineToSvgPath(outline);
      return d ? <path key={key} d={d} fill="#000000" /> : null;
    };

    return (
      <div className="flex flex-col items-center gap-3">
        <svg
          ref={svgRef}
          width={CSS_SIZE}
          height={CSS_SIZE}
          viewBox={`0 0 ${CSS_SIZE} ${CSS_SIZE}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none rounded-lg border border-neutral-300 bg-[#FAFAFA] shadow-sm"
          style={{ cursor: "crosshair" }}
        >
          {strokes.map((s, i) => renderStroke(s, `s-${i}`))}
          {inProgress && renderStroke(inProgress, "in-progress")}
        </svg>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-600">Brush:</span>
          {BRUSH_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setBrushSize(p.size)}
              aria-label={`${p.label} brush`}
              aria-pressed={brushSize === p.size}
              className={
                brushSize === p.size
                  ? "rounded border border-neutral-900 bg-neutral-900 px-3 py-1 text-white"
                  : "rounded border border-neutral-300 bg-white px-3 py-1 text-neutral-700 hover:border-neutral-500"
              }
            >
              {p.key}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 rounded border border-neutral-300 bg-white px-3 py-1 text-neutral-700 hover:border-red-400 hover:text-red-600"
          >
            Clear
          </button>
          <span className="ml-2 text-xs text-neutral-500">
            Tip: ⌘/Ctrl+Z to undo
          </span>
        </div>
      </div>
    );
  },
);
