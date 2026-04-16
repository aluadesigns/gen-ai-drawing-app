---
date: 2026-04-15
topic: drawing-tool
---

# Drawing Tool — v1 Requirements

## Problem Frame

The app's core loop is **draw → FAL.ai transforms the sketch → new AI image appears.** Before that loop can exist, we need a drawing surface. This brainstorm locks in the scope, UX, and tool choices for v1 of the drawing portion so planning can proceed without re-deciding product behavior.

## Layout

```
┌─────────────────────┐  ┌─────────────────────┐
│                     │  │                     │
│   sketch area       │  │   AI output         │
│        ✏️           │  │                     │
│                     │  │                     │
└─────────────────────┘  └─────────────────────┘
   ○ brush size [—|—]

   [ prompt: "a dragon in watercolor"    ]  [ Generate ]
```

Canvas on the left, generated image on the right. Prompt input + Generate button below. Minimal chrome around the canvas (brush size control only).

## Requirements

**Drawing experience**
- R1. Single pen tool, fixed black color, as the only drawing input — no shapes, no eraser, no color picker in v1.
- R2. A brush-size control (exact form — fixed presets vs. slider — deferred to planning).
- R3. Clear-canvas button that wipes the drawing.
- R4. Strokes render smoothly, not as jagged line segments. Visual polish measurably improves what FAL produces from the sketch.

**Generation loop**
- R5. Explicit "Generate" button triggers the FAL call. Generation is on-demand only — never automatic, debounced, or streamed.
- R6. Text-prompt input field alongside the canvas; prompt is sent to FAL together with the canvas PNG.
- R7. Generated image displays in the output panel next to the canvas.
- R8. While a FAL call is in flight, the Generate button shows a loading state and is disabled so the user can't double-fire.
- R9. FAL errors (network failure, rate limit, content-policy rejection) display inline in the output panel. No alert boxes, no crashes.

**Layout & platform**
- R10. Side-by-side layout: canvas left, AI output right, prompt + Generate below. Fixed desktop layout — no responsive resizing required for v1.
- R11. Desktop-only: mouse/trackpad input via Pointer Events. No touch, no stylus, no mobile viewport work.

## Success Criteria

- A user can draw a sketch, type a prompt, click Generate, and see an AI-generated image based on the sketch.
- Stroke rendering looks clean enough that FAL's output is recognizably related to what was drawn.
- Click-to-image round-trip completes in under ~15s on a typical FAL call.
- Failures (network, rate-limit, content policy) are visible to the user but don't crash the app.

## Scope Boundaries

Explicit non-goals for v1:

- No layers, eraser, color picker, shapes, or fill tool.
- No undo/redo. (Cheap to add later if strokes are stored as discrete objects — see Outstanding Questions.)
- No mobile, touch, or stylus support.
- No persistence. Refresh → blank canvas, prior generations gone.
- No streaming generation or continuous auto-triggered FAL calls.
- No authentication, no multi-user, no save/share.

## Key Decisions

- **Canvas tech: raw `<canvas>` element + `perfect-freehand` library.** React-ergonomic, small dependency (~5 KB gzipped), and produces naturalistic tapered strokes instead of jagged line segments. Smooth strokes feed FAL's sketch-to-image models better than raw polylines — this is a product quality decision, not just an aesthetic one. `react-konva`, `tldraw`, and `Excalidraw` were considered and rejected as overkill for a single-pen UX.
- **FAL model: start with FLUX-schnell img2img; switch to a ControlNet (Canny or Scribble) endpoint if sketch-fidelity is too loose.** On-demand generation removes latency pressure, so quality wins over raw speed. Exact model ID to be confirmed at https://fal.ai/models during planning — the FAL catalog evolves.
- **Generation loop: on-demand button press, not auto-debounced or streamed.** Simplest implementation, predictable cost, and avoids the request-cancellation / stale-result complexity of continuous flows. Can be upgraded later.
- **Platform: desktop only.** Single Pointer Events code path, fixed layout, no responsive canvas math. Demo target is a laptop.
- **UX scope: minimal pen-only.** The AI output is the star; drawing tools are input, not the product.

## Dependencies / Assumptions

- `FAL_KEY` in `.env.local` (already covered by `.env*` gitignore rule; documented in `CLAUDE.md`).
- FAL calls go through a Next.js server route (Route Handler or Server Action) — the raw key never ships to the client. Pattern already documented in `CLAUDE.md`.
- FAL still offers FLUX-schnell img2img and ControlNet endpoints at wire-up time. **Unverified as of this doc** — confirm against https://fal.ai/models in planning.

## Outstanding Questions

### Resolve Before Planning

*(None. The FAL model ID research item was demoted to "Deferred to Planning" as the first research task — see below. User chose to proceed to planning with that item deferred rather than resolved first.)*

### Deferred to Planning

- `[Affects R5, R7, R8, R9][Needs research][First research task]` Confirm the exact FAL model endpoint (primary + fallback) and its request/response shape at https://fal.ai/models. Planning cannot specify the server route, payload format, error shapes, or latency budget until this is resolved. Reviewers (feasibility, adversarial, scope-guardian) flagged this as a likely-inverted default — consider whether ControlNet-Scribble should be the *primary* endpoint rather than the fallback, since sparse black-on-white line art is its native input regime.
- `[Affects R2][User decision]` Brush-size control shape: one fixed size, 2–3 presets, or a slider? Low-stakes UX polish.
- `[Affects R7][User decision]` After a previous generation has completed and the user starts drawing a new sketch, should the prior AI image remain visible until the next generation completes, or clear immediately when the Generate button is clicked?
- `[Affects Scope Boundaries][User decision]` Is undo/redo worth adding to v1? Cheap to implement since `perfect-freehand` treats strokes as discrete objects, but adds a UI control. *(Contradiction flagged in document review: product-lens recommended adding to v1 for iteration affordance; scope-guardian recommended committing to exclusion. Either direction is defensible.)*

## Next Steps

-> `/ce:plan` for structured implementation planning.
