# gen-ai-drawing-app

## Purpose

Drawing tool where the user sketches on a canvas, clicks **Generate**, and an AI image model (FAL.ai) returns an image based on the sketch + a text prompt. The long-term vision is a real-time draw → transform → new image loop; v1 ships the synchronous version (draw → button → generate) to derisk the FAL integration and canvas quality first.

## Stack

- **Framework:** Next.js 16 (App Router, `src/` directory)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4
- **Linting:** ESLint (`eslint-config-next`)
- **Package manager:** npm
- **Node:** v24.x
- **Import alias:** `@/*` → `src/*`

### Feature-specific deps

- **AI provider:** [FAL.ai](https://fal.ai) via [`@fal-ai/client`](https://www.npmjs.com/package/@fal-ai/client)
- **Drawing surface:** [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand) rendered into an SVG (display) + an offscreen `<canvas>` (PNG export for FAL)

## Setup

The app requires a FAL API key in `.env.local` to do anything useful.

1. `cp .env.example .env.local`
2. Open https://fal.ai/dashboard/keys and create a key
3. Paste the key into `.env.local` as the value of `FAL_KEY` (no quotes, no trailing spaces)
4. `npm install`
5. `npm run dev` → http://localhost:3000

`.env.local` is gitignored (global `.env*` rule); `.env.example` is explicitly un-ignored via `!.env.example`.

## FAL.ai integration

- **SDK:** `@fal-ai/client`. Configured once at module scope in `src/app/api/generate/route.ts` via `fal.config({ credentials: process.env.FAL_KEY })`.
- **Model:** [`fal-ai/flux-2/klein/4b/edit`](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit) — FLUX.2 Klein 4B, an **edit model** that applies the prompt as an instruction to the sketch rather than blending via a strength slider. Fast (4 inference steps by default). Accepts up to 4 input images via `image_urls: [...]` array; we send the single canvas PNG. No `strength` parameter — tune the prompt wording to control how much the model transforms.
- **Input transport:** the client sends a base64 PNG data URI in JSON; the server converts it to a `Blob`, uploads via `fal.storage.upload()` to get a hosted URL, then passes the URL inside the `image_urls` array to `fal.subscribe()`. More reliable than inline data URIs across FAL endpoints.
- **Never commit the key. Never ship it to the client bundle.** The variable must NOT be prefixed `NEXT_PUBLIC_` — that would inline it into the browser bundle. `FAL_KEY` is referenced only in `src/app/api/generate/route.ts`.
- **Error handling:** the Route Handler normalizes all failures to `{ ok: false, error: "Generation failed — please try again" }` (HTTP 502) or input-validation variants (400 / 413). Raw FAL response bodies, stack traces, and request IDs are logged server-side via `console.error(err.message)` — never forwarded to the client.
- **Generation loop:** On-demand only — user clicks Generate, the server fires one FAL call, the result displays. No debouncing, no streaming, no auto-fire.

## File layout

```
src/
├── app/
│   ├── api/generate/route.ts   # POST — FAL proxy with normalized errors
│   ├── layout.tsx               # root layout + metadata
│   ├── page.tsx                 # 'use client' — two-panel UI, generation state
│   └── globals.css              # Tailwind v4 entry
├── components/
│   └── DrawingCanvas.tsx        # SVG pen surface, brush sizes, Clear, undo, exportPng()
docs/
├── brainstorms/drawing-tool-requirements.md   # v1 product scope
└── plans/2026-04-15-001-feat-drawing-tool-v1-plan.md
```

## Drawing surface conventions

- **State shape:** `strokes: Stroke[]` (committed) + `inProgress: Stroke | null` (current). Strokes are committed on `pointerup`. Storing strokes as discrete objects keeps undo cheap and lets the same stroke data render in SVG (display) and Canvas 2D (export).
- **Render symmetry:** both display and PNG export go through `getStroke()` + a shared `outlineToSvgPath()` helper. The export uses `new Path2D(pathString)` on an offscreen 1024×1024 canvas so FAL always sees the same geometry the user saw, scaled up.
- **Stroke options pinned:** `simulatePressure: false`, `thinning: 0`. With mouse input (uniform `pressure: 0.5`), simulated-pressure mode produces velocity-dependent stroke widths that don't match the user's brush-size selection. Disabling it keeps S/M/L (4/8/16 px) consistent.
- **Undo:** Single-level via `Cmd/Ctrl+Z`. The `keydown` listener is mounted on `window` but guards against firing when focus is in an `<input>`, `<textarea>`, or `contenteditable` — so the prompt input's native undo still works.

## Image display

The `<Image>` component uses `unoptimized` and `next.config.ts` includes FAL's hosted image domains in `images.remotePatterns` (`**.fal.media`, `**.fal.ai`).

## Commands

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` (http://localhost:3000) |
| Production build | `npm run build` |
| Production start | `npm start` |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` |

## Repository

- **GitHub:** https://github.com/aluadesigns/gen-ai-drawing-app
- **Default branch:** `main`

## Local-only files (not committed)

- `.env.local` — holds the real `FAL_KEY`. Covered by the global `.env*` gitignore rule.
- `.claude/settings.local.json` — per-user Claude Code permission grants. Explicitly gitignored.

## Scope boundaries (v1)

v1 is deliberately localhost-only. **No Upstash rate limiting, no body-size clamping at the edge, no public-deploy hardening is currently wired.** If the app is ever deployed to a public URL, those need to be added before the Route Handler becomes publicly reachable — otherwise the FAL API credits are an open faucet.

Also out of scope: layers, color picker, eraser, shapes, mobile/touch support, persistence across refresh, streaming generation, authentication.

## Conventions

*(Empty for now — will be filled in as patterns emerge. Don't invent conventions the project hasn't actually settled on.)*
