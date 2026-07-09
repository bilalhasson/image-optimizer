# squish

A fast, private **image compressor & format converter** that runs entirely in your browser.
Drop in an image, squish it down (JPEG · PNG · WebP · AVIF), and download — with a live
before/after you can actually see.

**Your images never leave your device.** Everything — decode, resize, re-encode — happens
locally in the browser via WebAssembly codecs in a Web Worker. No uploads, no accounts, no
server.

🔗 **Live:** https://squish.bilalhasson.com

## Why

Most online image tools upload your photos to a server. squish doesn't: client-side processing
means privacy by default, zero hosting cost to scale, and no upload/download round-trip.

## Tech

- **Vanilla TypeScript + Vite** — no framework; the focus is the browser platform.
- **WebAssembly codecs** ([jSquash](https://github.com/jamsinclair/jSquash): MozJPEG, libwebp,
  libavif, oxipng) running in a **Web Worker** so the UI never blocks.
- Static site, deployed on **Vercel**.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck (strict) + production build to dist/
npm run preview    # serve the production build
```

## Approach

Built design-first and deploy-first, in small phased increments: the design system is locked
before any code, and a real deployment goes live before features. Detailed planning docs are
kept locally (under `docs/plan/`, not tracked in this repo).

## Status

Early. Phase 0 (walking skeleton) is live: pick or drop an image and see it. Compression,
conversion, resize, batch, and HEIC input land in the phases that follow.
