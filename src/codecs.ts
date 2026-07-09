/**
 * Codec registry — maps an output format to a lazily-loaded WASM encoder.
 * Each encoder's WASM bundle downloads on first use (dynamic import), keeping
 * the initial load light and only paying for formats actually used.
 * We decode via the browser (worker), so only encoders are shipped.
 */

export type OutputFormat = 'jpeg' | 'webp' | 'avif' | 'png';

export interface EncodeOptions {
  /** 0–100; higher = better quality, larger file. Ignored by lossless PNG. */
  quality: number;
}

type Encoder = (data: ImageData, opts: EncodeOptions) => Promise<ArrayBuffer>;

const encoders: Record<OutputFormat, () => Promise<Encoder>> = {
  jpeg: async () => {
    const { default: encode } = await import('@jsquash/jpeg/encode');
    return (data, opts) => encode(data, { quality: opts.quality });
  },
  webp: async () => {
    const { default: encode } = await import('@jsquash/webp/encode');
    return (data, opts) => encode(data, { quality: opts.quality });
  },
  avif: async () => {
    const { default: encode } = await import('@jsquash/avif/encode');
    return (data, opts) => encode(data, { quality: opts.quality });
  },
  png: async () => {
    // PNG is lossless — quality is ignored.
    const { default: encode } = await import('@jsquash/png/encode');
    return (data) => encode(data);
  },
};

export const mimeFor: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
};

export const extFor: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif',
  png: 'png',
};

/** Formats that cannot store transparency — source alpha must be flattened onto a fill. */
export const isOpaqueFormat: Record<OutputFormat, boolean> = {
  jpeg: true,
  webp: false,
  avif: false,
  png: false,
};

/** Whether the format's quality slider is meaningful (false = lossless). */
export const isLossy: Record<OutputFormat, boolean> = {
  jpeg: true,
  webp: true,
  avif: true,
  png: false,
};

export function getEncoder(format: OutputFormat): Promise<Encoder> {
  return encoders[format]();
}
