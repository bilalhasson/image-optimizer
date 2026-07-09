/**
 * Encode worker — all heavy work runs here so the main thread never blocks.
 * Contract (reused by every later phase):
 *   main → worker:  EncodeRequest   (source bytes transferred in)
 *   worker → main:  EncodeResponse  (encoded bytes transferred out)
 *
 * Pipeline: decode the source bytes to ImageData via the browser
 * (createImageBitmap + OffscreenCanvas — handles any format the browser reads),
 * then encode to the target format with a jSquash WASM codec.
 */
import { getEncoder, type OutputFormat } from './codecs';

export interface EncodeRequest {
  id: number;
  bytes: ArrayBuffer;
  /** Source MIME type, for the decode Blob. */
  type: string;
  format: OutputFormat;
  quality: number;
}

export type EncodeResponse =
  | { id: number; ok: true; bytes: ArrayBuffer; size: number; width: number; height: number; ms: number }
  | { id: number; ok: false; error: string };

async function decodeToImageData(bytes: ArrayBuffer, type: string): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context.');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, bytes, type, format, quality } = e.data;
  const started = performance.now();
  try {
    const imageData = await decodeToImageData(bytes, type);
    const encode = await getEncoder(format);
    const out = await encode(imageData, { quality });
    const res: EncodeResponse = {
      id,
      ok: true,
      bytes: out,
      size: out.byteLength,
      width: imageData.width,
      height: imageData.height,
      ms: Math.round(performance.now() - started),
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
