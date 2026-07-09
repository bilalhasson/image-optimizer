import './style.css';
import { extFor, mimeFor, type OutputFormat } from './codecs';
import type { EncodeRequest, EncodeResponse } from './worker';

/**
 * Phase 1 — single-image compress core loop.
 * Pick/drop an image → quality slider → encode in a Web Worker (jSquash MozJPEG)
 * → before/after comparison + size-saved readout → download.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// landing
const hero = $('hero');
const fileInput = $<HTMLInputElement>('file');
const drop = $('drop');
const errorBox = $('error');
const errorMsg = $('error-msg');

// working view
const app = $('app');
const vName = $('v-name');
const vDims = $('v-dims');
const cmp = $('cmp');
const imgBefore = $<HTMLImageElement>('img-before');
const imgAfter = $<HTMLImageElement>('img-after');
const handle = $('handle');
const qEl = $<HTMLInputElement>('quality');
const qVal = $('qval');
const rFrom = $('r-from');
const rTo = $('r-to');
const rSav = $('r-sav');
const bar = $('bar');
const dl = $<HTMLButtonElement>('dl');
const appError = $('app-error');
const appErrorMsg = $('app-error-msg');

const OUTPUT: OutputFormat = 'jpeg';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let jobId = 0;

// per-file state
let curFile: File | null = null;
let originalUrl: string | null = null;
let originalSize = 0;
let encodedUrl: string | null = null;
let encodedBlob: Blob | null = null;
let debounceTimer: number | undefined;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const revoke = (u: string | null) => {
  if (u) URL.revokeObjectURL(u);
};

function setBusy(on: boolean): void {
  bar.hidden = !on;
  dl.disabled = on || !encodedBlob;
  if (on) {
    rSav.className = 'savings muted';
    rSav.textContent = 'Encoding…';
  }
}

const showAppError = (msg: string) => {
  appErrorMsg.textContent = msg;
  appError.hidden = false;
};

/* ---- worker results ---- */
worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
  const r = e.data;
  if (r.id !== jobId) return; // ignore superseded jobs
  setBusy(false);
  if (!r.ok) {
    showAppError(r.error);
    return;
  }
  appError.hidden = true;

  revoke(encodedUrl);
  encodedBlob = new Blob([r.bytes], { type: mimeFor[OUTPUT] });
  encodedUrl = URL.createObjectURL(encodedBlob);
  imgAfter.src = encodedUrl;

  rFrom.textContent = formatBytes(originalSize);
  rTo.textContent = formatBytes(r.size);
  const pct = Math.round((1 - r.size / originalSize) * 100);
  if (pct >= 0) {
    rSav.className = 'savings';
    rSav.textContent = `↓ ${pct}% smaller`;
  } else {
    rSav.className = 'savings neg';
    rSav.textContent = `↑ ${Math.abs(pct)}% larger — keep original`;
  }
  dl.disabled = false;
};

async function encode(): Promise<void> {
  if (!curFile) return;
  const id = ++jobId;
  setBusy(true);
  try {
    const bytes = await curFile.arrayBuffer(); // fresh buffer each run (transfer detaches it)
    const req: EncodeRequest = { id, bytes, type: curFile.type, format: OUTPUT, quality: Number(qEl.value) };
    worker.postMessage(req, [bytes]);
  } catch (err) {
    setBusy(false);
    showAppError(err instanceof Error ? err.message : String(err));
  }
}

function scheduleEncode(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => void encode(), 220);
}

/* ---- comparison slider ---- */
let split = 52;
function setSplit(p: number): void {
  split = Math.max(0, Math.min(100, p));
  cmp.style.setProperty('--split', `${split}%`);
  handle.setAttribute('aria-valuenow', String(Math.round(split)));
}
function splitFromX(clientX: number): void {
  const rect = cmp.getBoundingClientRect();
  setSplit(((clientX - rect.left) / rect.width) * 100);
}
let dragging = false;
cmp.addEventListener('pointerdown', (e) => {
  dragging = true;
  cmp.setPointerCapture(e.pointerId);
  splitFromX(e.clientX);
});
cmp.addEventListener('pointermove', (e) => {
  if (dragging) splitFromX(e.clientX);
});
cmp.addEventListener('pointerup', () => {
  dragging = false;
});
handle.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    setSplit(split - 4);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    setSplit(split + 4);
    e.preventDefault();
  }
});

/* ---- open / reset ---- */
function openFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    errorMsg.textContent = `"${file.name}" isn't an image we can read. Try a JPEG, PNG, WebP, AVIF or GIF.`;
    errorBox.hidden = false;
    return;
  }
  errorBox.hidden = true;

  curFile = file;
  originalSize = file.size;
  revoke(originalUrl);
  revoke(encodedUrl);
  encodedUrl = null;
  encodedBlob = null;
  originalUrl = URL.createObjectURL(file);
  appError.hidden = true;

  imgBefore.onload = () => {
    cmp.style.setProperty('--ar', `${imgBefore.naturalWidth} / ${imgBefore.naturalHeight}`);
    imgAfter.src = originalUrl!; // placeholder until the first encode returns
    vName.textContent = file.name;
    vDims.textContent = `${imgBefore.naturalWidth} × ${imgBefore.naturalHeight} · ${formatBytes(file.size)}`;
    rFrom.textContent = formatBytes(originalSize);
    rTo.textContent = '—';
    setSplit(52);
    hero.hidden = true;
    app.hidden = false;
    app.setAttribute('aria-hidden', 'false');
    app.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    void encode();
  };
  imgBefore.onerror = () => {
    errorMsg.textContent = `We couldn't decode "${file.name}". It may be corrupt or an unsupported format.`;
    errorBox.hidden = false;
  };
  imgBefore.src = originalUrl;
}

function reset(): void {
  revoke(originalUrl);
  revoke(encodedUrl);
  originalUrl = null;
  encodedUrl = null;
  encodedBlob = null;
  curFile = null;
  imgBefore.removeAttribute('src');
  imgAfter.removeAttribute('src');
  app.hidden = true;
  app.setAttribute('aria-hidden', 'true');
  hero.hidden = false;
  fileInput.value = '';
  appError.hidden = true;
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
}

/* ---- download ---- */
dl.addEventListener('click', () => {
  if (!encodedBlob || !encodedUrl || !curFile) return;
  const base = curFile.name.replace(/\.[^.]+$/, '');
  const a = document.createElement('a');
  a.href = encodedUrl;
  a.download = `${base}.${extFor[OUTPUT]}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ---- quality ---- */
qEl.addEventListener('input', () => {
  qVal.textContent = qEl.value;
  scheduleEncode();
});

/* ---- file inputs ---- */
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
  if (file) openFile(file);
});
$('back').addEventListener('click', reset);

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
      if (file) openFile(file);
    }
  }),
);

/* ---- theme ---- */
$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const current =
    root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
});
