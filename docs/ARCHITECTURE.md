# Architecture

squish is a 100% client-side static site: **Vanilla TypeScript + Vite**, no backend. All image
work runs in the browser via **WebAssembly codecs in a pool of Web Workers**. This doc maps the
code; the day-to-day is in the [README](../README.md).

## Data flow

```
File(s) ──▶ intake ──▶ Item[] (state) ──▶ encode (worker pool) ──▶ render (view)
             │                                   │
      screen type/animated/HEIC          decode → resize → flatten → encode (WASM)
```

- **intake** screens each file (image type, animated GIF/WebP/APNG, HEIC) before admitting it,
  decodes HEIC→PNG on demand, and creates an `Item`.
- **encode** submits each `Item` to the worker pool with the current global settings; results
  update the `Item` and re-render.
- **render** is the only place that touches the DOM for app views (detail + batch list).

## The encode pipeline (`worker.ts`)

Runs entirely inside a worker so the UI never blocks:

1. **decode** — `createImageBitmap(blob, { imageOrientation: 'from-image' })` (EXIF-correct).
2. **resize** — draw onto an `OffscreenCanvas` at target dimensions (high-quality smoothing).
3. **flatten** — if the target is opaque (JPEG) and the source has alpha, composite onto a fill colour.
4. **encode** — a jSquash WASM encoder; in *target-size* mode, binary-search quality on the
   already-decoded `ImageData` for the largest output under the byte budget.

Metadata is stripped implicitly: decoding to raw `ImageData` and re-encoding drops all EXIF/ICC.

### Message contract (`main ↔ worker`)

`EncodeRequest { id, bytes, type, format, quality, fillColor?, targetWidth?, targetHeight?, targetBytes? }`
→ `EncodeResponse { id, ok, bytes, size, width, height, ms, hasAlpha, quality, reachedTarget? }`.
Source and result `ArrayBuffer`s are **transferred** (no structured-clone copies).

## Worker pool (`pool.ts`)

`EncodePool` holds `min(cores − 1, 4)` module workers and a queue; `submit()` resolves per job,
`onStart` fires when a worker picks it up (queued → processing). Bounding the pool caps memory
(AVIF's codec is ~1 MB × N).

## Codec registry (`codecs.ts`)

Maps `OutputFormat → () => encoder`, each **lazy-loading its WASM on first use** (encode-only
subpaths, so decoder WASM isn't shipped). Also exports `mimeFor`, `extFor`, `isOpaqueFormat`,
`isLossy`. Adding a format = one registry entry.

## Module map (`src/`)

| Module | Responsibility |
|---|---|
| `main.ts` | Entry: wire modules, initial render. |
| `state.ts` | `Item` model + shared `state` object; `detailItem()`. |
| `dom.ts` | Cached element handles + `$`/`show`. |
| `render.ts` | View layer: render/detail/summary/rows, settings-derived UI, navigation. |
| `encode.ts` | Worker-pool orchestration (`encodeItem`, `reencodeAll`, `loadDims`). |
| `intake.ts` | File screening + HEIC decode + adding items. |
| `controls.ts` | Event wiring for controls, file inputs, drag/drop, theme. |
| `compare.ts` | Before/after comparison slider. |
| `download.ts` | Single download + zip-all (`fflate`, stored). |
| `sniff.ts` | HEIC / animated header sniffs. |
| `format.ts`, `toast.ts` | Byte formatting + transient notices. |
| `codecs.ts`, `pool.ts`, `worker.ts` | The WASM encode engine. |

Boundaries: **view / state / IO / orchestration are separate**; only `render.ts` mutates app-view
DOM; only `worker.ts` runs codecs. Cross-module calls happen at runtime (import cycles are safe).

## Build & deploy

`pnpm build` = strict `tsc --noEmit` + `vite build`. Vite emits the worker as an ES module
(`worker.format: 'es'`) and each codec's WASM as a lazy chunk; jSquash/heic-to are excluded from
dev dep-optimization so their WASM resolves. Static output deploys to Vercel, auto-deployed from
`main`; CI (`.github/workflows/ci.yml`) runs typecheck + build on every push/PR.

## Design system

Tokens (spruce-green accent, dark+light, motion) live in `src/style.css` and are the source of
truth for the UI; the internal design track is kept locally under `docs/plan/design/`.
