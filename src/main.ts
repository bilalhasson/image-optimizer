import './style.css';
import type { EncodeRequest, EncodeResponse } from './worker';

/**
 * Phase 0 — walking skeleton.
 * Pick or drop ONE image and display it locally with its name, dimensions and size.
 * No processing yet: this exists to prove the deploy pipeline and the File API.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const hero = $('hero');
const viewer = $('viewer');
const fileInput = $<HTMLInputElement>('file');
const drop = $('drop');
const img = $<HTMLImageElement>('v-img');
const vName = $('v-name');
const vDims = $('v-dims');
const errorBox = $('error');
const errorMsg = $('error-msg');

let currentUrl: string | null = null;

/* --- Phase 1 spike: prove the worker + WASM encode pipeline end-to-end --- */
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let jobId = 0;

worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
  const r = e.data;
  if (r.ok) {
    vDims.textContent += `  →  ${formatBytes(r.size)} as JPEG q75 (${r.ms}ms)`;
  } else {
    showError(`Compression failed: ${r.error}`);
  }
};

async function encodePreview(file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  const req: EncodeRequest = { id: ++jobId, bytes, type: file.type, format: 'jpeg', quality: 75 };
  worker.postMessage(req, [bytes]);
}

/** Human-readable byte size using tabular-friendly units. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function showError(message: string): void {
  errorMsg.textContent = message;
  errorBox.hidden = false;
}

function clearError(): void {
  errorBox.hidden = true;
}

function reset(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  img.removeAttribute('src');
  img.alt = '';
  viewer.hidden = true;
  viewer.setAttribute('aria-hidden', 'true');
  hero.hidden = false;
  fileInput.value = '';
}

function handleFile(file: File): void {
  clearError();

  if (!file.type.startsWith('image/')) {
    showError(`"${file.name}" isn't an image we can read. Try a JPEG, PNG, WebP, AVIF or GIF.`);
    return;
  }

  // Revoke any previous object URL before creating a new one.
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);

  img.onload = () => {
    vName.textContent = file.name;
    vDims.textContent = `${img.naturalWidth} × ${img.naturalHeight} · ${formatBytes(file.size)}`;
    img.alt = `Preview of ${file.name}`;
    hero.hidden = true;
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    viewer.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    void encodePreview(file);
  };

  img.onerror = () => {
    showError(`We couldn't decode "${file.name}". The file may be corrupt or an unsupported format.`);
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  };

  img.src = currentUrl;
}

/* ---- wire up inputs ---- */
$('pick').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

$('back').addEventListener('click', reset);

/* drag & drop */
(['dragenter', 'dragover'] as const).forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('drag');
  }),
);
(['dragleave', 'drop'] as const).forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (ev === 'drop') {
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file) handleFile(file);
    }
  }),
);

/* theme toggle */
$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const current =
    root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
});
