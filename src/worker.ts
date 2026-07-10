/**
 * Encode worker — all heavy work runs here so the main thread never blocks.
 * Contract (reused by every phase):
 *   main → worker:  EncodeRequest   (source bytes transferred in)
 *   worker → main:  EncodeResponse  (encoded bytes transferred out)
 *
 * Pipeline: decode source bytes to ImageData via the browser (createImageBitmap
 * + OffscreenCanvas), flatten transparency onto a fill when the target format is
 * opaque (JPEG), then encode with a jSquash WASM codec.
 */
import { getEncoder, isOpaqueFormat, isLossy, type OutputFormat } from './codecs';

export interface EncodeRequest {
  id: number;
  bytes: ArrayBuffer;
  /** Source MIME type, for the decode Blob. */
  type: string;
  format: OutputFormat;
  quality: number;
  /** Fill colour used when flattening transparency for an opaque target. */
  fillColor?: string;
  /** Target output dimensions. Omit (or match source) for no resize. Aspect handled by caller. */
  targetWidth?: number;
  targetHeight?: number;
  /** If set (lossy formats only), binary-search quality for the largest output ≤ this many bytes. */
  targetBytes?: number;
}

export type EncodeResponse =
  | {
      id: number;
      ok: true;
      bytes: ArrayBuffer;
      size: number;
      width: number;
      height: number;
      ms: number;
      /** Whether the source had any transparent pixels. */
      hasAlpha: boolean;
      /** Quality actually used (the search result in target-size mode). */
      quality: number;
      /** In target-size mode: whether a quality fitting under the budget was found. */
      reachedTarget?: boolean;
    }
  | { id: number; ok: false; error: string };

function anyTransparent(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

interface Prepared {
  imageData: ImageData;
  hasAlpha: boolean;
  width: number;
  height: number;
}

async function prepare(
  bytes: ArrayBuffer,
  type: string,
  format: OutputFormat,
  fillColor: string | undefined,
  targetWidth: number | undefined,
  targetHeight: number | undefined,
): Promise<Prepared> {
  // 'from-image' bakes EXIF orientation into the pixels; since we then strip all
  // metadata on re-encode, this is the only way the output stays correctly oriented.
  const bitmap = await createImageBitmap(new Blob([bytes], { type }), {
    imageOrientation: 'from-image',
  });
  // Resize stage: draw the source at the target size (high-quality downscale).
  const width = Math.max(1, Math.round(targetWidth ?? bitmap.width));
  const height = Math.max(1, Math.round(targetHeight ?? bitmap.height));
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(bitmap, 0, 0, width, height);
    const raw = ctx.getImageData(0, 0, width, height);
    const hasAlpha = anyTransparent(raw.data);

    // Opaque target + transparent source → flatten onto the chosen fill colour.
    if (isOpaqueFormat[format] && hasAlpha) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = fillColor || '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return { imageData: ctx.getImageData(0, 0, width, height), hasAlpha, width, height };
    }
    return { imageData: raw, hasAlpha, width, height };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, bytes, type, format, quality, fillColor, targetWidth, targetHeight, targetBytes } =
    e.data;
  const started = performance.now();
  try {
    const { imageData, hasAlpha, width, height } = await prepare(
      bytes,
      type,
      format,
      fillColor,
      targetWidth,
      targetHeight,
    );
    const encode = await getEncoder(format);

    let out: ArrayBuffer;
    let usedQuality = quality;
    let reachedTarget: boolean | undefined;

    if (targetBytes && isLossy[format]) {
      // Decode happened once above; here we only re-encode at different qualities.
      let lo = 1;
      let hi = 100;
      let best: ArrayBuffer | null = null;
      let bestQ = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const buf = await encode(imageData, { quality: mid });
        if (buf.byteLength <= targetBytes) {
          best = buf;
          bestQ = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (best) {
        out = best;
        usedQuality = bestQ;
        reachedTarget = true;
      } else {
        out = await encode(imageData, { quality: 1 }); // smallest we can do
        usedQuality = 1;
        reachedTarget = false;
      }
    } else {
      out = await encode(imageData, { quality });
    }

    const res: EncodeResponse = {
      id,
      ok: true,
      bytes: out,
      size: out.byteLength,
      width,
      height,
      ms: Math.round(performance.now() - started),
      hasAlpha,
      quality: usedQuality,
      reachedTarget,
    };
    self.postMessage(res, { transfer: [out] });
  } catch (err) {
    const res: EncodeResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};
