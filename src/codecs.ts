/**
 * Codec registry — maps an output format to a lazily-loaded WASM encoder.
 * Each encoder's WASM bundle downloads on first use (dynamic import), keeping
 * the initial load light. Phase 1 ships JPEG (MozJPEG); Phase 2 adds the rest.
 */

export type OutputFormat = 'jpeg';

export interface EncodeOptions {
  /** 0–100; higher = better quality, larger file. */
  quality: number;
}

type Encoder = (data: ImageData, opts: EncodeOptions) => Promise<ArrayBuffer>;

const encoders: Record<OutputFormat, () => Promise<Encoder>> = {
  jpeg: async () => {
    // Encode-only subpath: we decode via the browser, so we don't ship the JPEG decoder WASM.
    const { default: encode } = await import('@jsquash/jpeg/encode');
    return (data, opts) => encode(data, { quality: opts.quality });
  },
};

/** MIME type for each output format (for Blobs / download). */
export const mimeFor: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
};

/** File extension for each output format. */
export const extFor: Record<OutputFormat, string> = {
  jpeg: 'jpg',
};

export function getEncoder(format: OutputFormat): Promise<Encoder> {
  return encoders[format]();
}
