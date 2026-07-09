import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    // The encode worker dynamically imports jSquash codecs (code-splitting),
    // which requires ES module output — the default 'iife' can't code-split.
    format: 'es',
  },
});
