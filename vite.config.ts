import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    // The encode worker dynamically imports jSquash codecs (code-splitting),
    // which requires ES module output — the default 'iife' can't code-split.
    format: 'es',
  },
  optimizeDeps: {
    // jSquash loads its own WASM relative to the package. Vite's dev dep-optimizer
    // rewrites those paths and the .wasm fetch 404s → SPA fallback returns index.html
    // → "WebAssembly.Module doesn't start with '\0asm'". Excluding keeps dev working.
    exclude: ['@jsquash/jpeg', '@jsquash/png', '@jsquash/webp', '@jsquash/avif'],
  },
});
