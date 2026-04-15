# gen-ai-drawing-app

## Purpose

Real-time drawing tool that sends the user's drawing to an AI image model and generates new images from it. Think: user sketches on a canvas, model produces polished / reinterpreted images in near real time.

The user-facing loop is **draw → transform → new image**, so latency, incremental updates, and the canvas ↔ model interaction pattern are the parts of the app that matter most.

## Stack

- **Framework:** Next.js 16 (App Router, `src/` directory)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Linting:** ESLint (`eslint-config-next`)
- **Package manager:** npm
- **Node:** v24.x
- **Import alias:** `@/*` → `src/*`

- **AI provider:** [FAL.ai](https://fal.ai) — chosen for low-latency hosted inference, good fit for the real-time loop.

Canvas library is not yet chosen. When picking, bias toward something with real React ergonomics (e.g., `react-konva`, `tldraw`, or a thin wrapper over raw `<canvas>`) — avoid imperative DOM-heavy libraries that fight React.

## FAL.ai integration

- **SDK:** `@fal-ai/client` (JavaScript/TypeScript client).
- **API key:** stored as `FAL_KEY` in `.env.local` (already gitignored via the `.env*` rule). **Never commit the key and never ship it to the client bundle.**
- **Call pattern:** proxy FAL calls through Next.js server code — either a Route Handler (`src/app/api/.../route.ts`) or a Server Action. The browser should hit our own endpoint, never FAL directly with the raw key. FAL offers a built-in `serverProxy` helper for Next.js that handles this cleanly.
- **Model selection:** for the sketch-to-image loop, prefer fast / turbo variants (FLUX-schnell, fast-SDXL, lightning models) or a ControlNet variant that takes the sketch as a conditioning input. Exact model ID should live in one place (a config constant) so it's swappable.
- **Streaming / realtime:** FAL supports queue + streaming APIs. For the "draw → new image" loop, debounce canvas changes and use the streaming endpoint rather than firing a request per stroke.

## Commands

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` (http://localhost:3000) |
| Production build | `npm run build` |
| Production start | `npm start` |
| Lint | `npm run lint` |

## Repository

- **GitHub:** https://github.com/aluadesigns/gen-ai-drawing-app
- **Default branch:** `main`

## Local-only files (not committed)

`.claude/settings.local.json` is excluded via `.gitignore` — it stores per-user Claude Code permission grants and must stay local.

## Conventions

*(Empty for now — will be filled in as patterns emerge. Don't invent conventions the project hasn't actually settled on.)*
