# squish

A fast, private **image compressor, converter & resizer** that runs entirely in your browser.
Drop images in, tune them, and download — with a live before/after you can actually see.

**Your images never leave your device.** Every step — decode, resize, re-encode — happens
locally via WebAssembly codecs in Web Workers. No uploads, no accounts, no server.

🔗 **Live:** https://squish.bilalhasson.com

## Features

- **Compress** with a live quality slider and a real before/after comparison.
- **Convert** between **JPEG · WebP · AVIF · PNG** (transparent → JPEG flattens onto a fill colour you choose).
- **Resize** — a Scale slider or exact width/height, aspect-locked, never upscales.
- **Target file size** — “get it under X KB”; picks the best quality automatically.
- **Batch** — drop many at once; each processes in parallel with per-file progress and error isolation; **download all as a zip**.
- **HEIC** input (iPhone photos) via an on-demand decoder.
- **Honest** — strips EXIF/metadata, respects orientation, rejects animated files, and tells you when a re-encode would be *larger* (keep the original).

## Why client-side

Most online image tools upload your photos to a server. squish doesn’t: local processing means
privacy by default, zero hosting cost to scale (it runs on the user’s CPU), and no
upload/download round-trip.

## How it works

- **Vanilla TypeScript + Vite** — no framework; the value is the browser platform itself.
- **WebAssembly codecs** ([jSquash](https://github.com/jamsinclair/jSquash): MozJPEG, libwebp, libavif, oxipng) run in a **bounded pool of Web Workers**, so the UI never blocks even on big batches.
- Pipeline per image: **decode → (resize) → (flatten) → encode**; codecs and the HEIC decoder **lazy-load** only when first used.
- Static site on **Vercel**; auto-deploys from `main`. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Develop

Uses **Node 24** (`.nvmrc`) and **pnpm** (pinned via `packageManager`); with
[Corepack](https://nodejs.org/api/corepack.html) the right pnpm is used automatically.

```bash
nvm use            # Node 24, per .nvmrc
corepack enable    # activates the pinned pnpm
pnpm install
pnpm dev           # local dev server
pnpm build         # strict typecheck + production build to dist/
pnpm preview       # serve the production build
```

## License

[MIT](./LICENSE) © Bilal Hasson
