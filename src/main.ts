import './style.css';
import { extFor, mimeFor, isLossy, isOpaqueFormat, type OutputFormat } from './codecs';
import type { EncodeRequest, EncodeResponse } from './worker';

/**
 * Phases 1–2 — single-image compress + format conversion.
 * Pick/drop → choose output format (JPEG/WebP/AVIF/PNG) + quality → encode in a
 * Web Worker → before/after comparison + size-saved readout → download.
 * Transparent source → opaque target (JPEG) flattens onto a chosen fill colour.
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
const fmts = $('fmts');
const fmtNote = $('fmt-note');
const qualitySec = $('quality-sec');
const qEl = $<HTMLInputElement>('quality');
const qVal = $('qval');
const flattenSec = $('flatten-sec');
const fillHex = $('fill-hex');
const fillCustom = $<HTMLInputElement>('fill-custom');
const rFrom = $('r-from');
const rTo = $('r-to');
const rSav = $('r-sav');
const bar = $('bar');
const dl = $<HTMLButtonElement>('dl');
const appError = $('app-error');
const appErrorMsg = $('app-error-msg');
const resizeAcc = $<HTMLDetailsElement>('resize-acc');
const resizeState = $('resize-state');
const rzW = $<HTMLInputElement>('rz-w'); // editable number (exact px)
const rzH = $<HTMLInputElement>('rz-h'); // editable number (exact px)
const rzP = $<HTMLInputElement>('rz-p'); // scale slider
const rzPv = $('rz-p-v');
const resizeOut = $('resize-out');

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let jobId = 0;

// selection state (persists across files)
let format: OutputFormat = 'webp';
let fillColor = '#ffffff';

let scale = 1; // resize scale (0 < scale ≤ 1); never upscales
let originalW = 0;
let originalH = 0;

// per-file state
let curFile: File | null = null;
let originalUrl: string | null = null;
let originalSize = 0;
let encodedUrl: string | null = null;
let encodedBlob: Blob | null = null;
let lastHasAlpha = false;
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
    rSav.textContent = `Encoding ${format.toUpperCase()}…`;
  }
}

const showAppError = (msg: string) => {
  appErrorMsg.textContent = msg;
  appError.hidden = false;
};

/* ---- format / fill UI ---- */
function updateFlattenUI(): void {
  flattenSec.hidden = !(lastHasAlpha && isOpaqueFormat[format]);
}

function updateFormatUI(): void {
  for (const chip of fmts.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.fmt === format));
  }
  qualitySec.classList.toggle('disabled', !isLossy[format]);
  if (format === 'avif') {
    fmtNote.textContent = 'AVIF encodes slower — especially on mobile.';
    fmtNote.hidden = false;
  } else if (format === 'png') {
    fmtNote.textContent = 'PNG is lossless — quality doesn’t apply.';
    fmtNote.hidden = false;
  } else {
    fmtNote.hidden = true;
  }
  updateFlattenUI();
}

/** Aspect-locked target dims from the resize scale. null = keep original (scale ≥ 1). */
function computeTarget(): { tw: number; th: number } | null {
  if (scale >= 1 || !originalW || !originalH) return null;
  return {
    tw: Math.max(1, Math.round(originalW * scale)),
    th: Math.max(1, Math.round(originalH * scale)),
  };
}

function updateResizeUI(): void {
  const t = computeTarget();
  if (!t) {
    resizeState.textContent = 'Original';
    resizeOut.textContent = originalW ? `No resize · ${originalW} × ${originalH}` : '—';
  } else {
    resizeState.textContent = `${t.tw} × ${t.th}`;
    resizeOut.textContent = `${originalW} × ${originalH} → ${t.tw} × ${t.th}`;
  }
}

/** Set the scale (clamped so it never upscales) and sync all three sliders + labels. */
function syncFromScale(s: number): void {
  const minScale = 1 / Math.max(originalW, originalH, 1);
  scale = Math.min(1, Math.max(minScale, s));
  const tw = Math.max(1, Math.round(originalW * scale));
  const th = Math.max(1, Math.round(originalH * scale));
  const pct = Math.round(scale * 100);
  rzW.value = String(tw);
  rzH.value = String(th);
  rzP.value = String(pct);
  rzPv.textContent = `${pct}%`;
  updateResizeUI();
}

function setFill(hex: string): void {
  fillColor = hex;
  fillHex.textContent = hex.toUpperCase();
  for (const sw of flattenSec.querySelectorAll<HTMLButtonElement>('.swatch')) {
    sw.setAttribute('aria-pressed', String(sw.dataset.fill?.toLowerCase() === hex.toLowerCase()));
  }
}

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
  lastHasAlpha = r.hasAlpha;
  updateFlattenUI();

  revoke(encodedUrl);
  encodedBlob = new Blob([r.bytes], { type: mimeFor[format] });
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
    const t = computeTarget();
    const noResize = !t || (t.tw === originalW && t.th === originalH);
    const req: EncodeRequest = {
      id,
      bytes,
      type: curFile.type,
      format,
      quality: Number(qEl.value),
      fillColor,
      targetWidth: noResize ? undefined : t.tw,
      targetHeight: noResize ? undefined : t.th,
    };
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
  lastHasAlpha = false;
  revoke(originalUrl);
  revoke(encodedUrl);
  originalUrl = null;
  encodedUrl = null;
  encodedBlob = null;
  originalUrl = URL.createObjectURL(file);
  appError.hidden = true;

  imgBefore.onload = () => {
    cmp.style.setProperty('--ar', `${imgBefore.naturalWidth} / ${imgBefore.naturalHeight}`);
    originalW = imgBefore.naturalWidth;
    originalH = imgBefore.naturalHeight;
    rzW.max = String(originalW);
    rzH.max = String(originalH);
    resizeAcc.open = false;
    syncFromScale(1);
    imgAfter.src = originalUrl!; // placeholder until the first encode returns
    vName.textContent = file.name;
    vDims.textContent = `${imgBefore.naturalWidth} × ${imgBefore.naturalHeight} · ${formatBytes(file.size)}`;
    rFrom.textContent = formatBytes(originalSize);
    rTo.textContent = '—';
    setSplit(52);
    updateFormatUI();
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
  lastHasAlpha = false;
  scale = 1;
  originalW = 0;
  originalH = 0;
  resizeAcc.open = false;
  imgBefore.removeAttribute('src');
  imgAfter.removeAttribute('src');
  app.hidden = true;
  app.setAttribute('aria-hidden', 'true');
  hero.hidden = false;
  fileInput.value = '';
  appError.hidden = true;
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
}

/* ---- controls ---- */
fmts.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!btn || !btn.dataset.fmt) return;
  format = btn.dataset.fmt as OutputFormat;
  updateFormatUI();
  void encode();
});

flattenSec.addEventListener('click', (e) => {
  const sw = (e.target as HTMLElement).closest<HTMLButtonElement>('.swatch');
  if (!sw || !sw.dataset.fill) return;
  setFill(sw.dataset.fill);
  void encode();
});
fillCustom.addEventListener('input', () => {
  setFill(fillCustom.value);
  scheduleEncode();
});

qEl.addEventListener('input', () => {
  qVal.textContent = qEl.value;
  scheduleEncode();
});

// slider drags live; the number fields commit on change (blur/Enter) so aspect-sync
// doesn't rewrite the field mid-keystroke.
rzP.addEventListener('input', () => {
  syncFromScale(Number(rzP.value) / 100);
  scheduleEncode();
});
function commitDim(el: HTMLInputElement, original: number): void {
  const v = Number(el.value);
  if (original && Number.isFinite(v) && v > 0) syncFromScale(v / original);
  else syncFromScale(scale); // invalid entry → restore fields to current scale
  void encode();
}
rzW.addEventListener('change', () => commitDim(rzW, originalW));
rzH.addEventListener('change', () => commitDim(rzH, originalH));

dl.addEventListener('click', () => {
  if (!encodedBlob || !encodedUrl || !curFile) return;
  const base = curFile.name.replace(/\.[^.]+$/, '');
  const a = document.createElement('a');
  a.href = encodedUrl;
  a.download = `${base}.${extFor[format]}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
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
