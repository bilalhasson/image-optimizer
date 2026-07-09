import './style.css';
import { extFor, mimeFor, isLossy, isOpaqueFormat, type OutputFormat } from './codecs';
import type { EncodeRequest } from './worker';
import { EncodePool } from './pool';

/**
 * squish — Phases 1–4.
 * Compress + convert + resize, single-image (before/after detail) or batch (list + zip).
 * One global setting applies to all; each image encodes in a bounded worker pool.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};
const show = (el: HTMLElement, on: boolean) => {
  el.hidden = !on;
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// landing
const hero = $('hero');
const fileInput = $<HTMLInputElement>('file');
const drop = $('drop');
const errorBox = $('error');
const errorMsg = $('error-msg');

// app shell
const app = $('app');
const vName = $('v-name');
const vDims = $('v-dims');
const addMore = $('add-more');
const backToBatch = $('back-to-batch');
const startOverBtn = $('start-over');

// detail (comparison + readout)
const cmp = $('cmp');
const imgBefore = $<HTMLImageElement>('img-before');
const imgAfter = $<HTMLImageElement>('img-after');
const handle = $('handle');
const detailReadout = $('detail-readout');
const rFrom = $('r-from');
const rTo = $('r-to');
const rSav = $('r-sav');
const bar = $('bar');
const dl = $<HTMLButtonElement>('dl');
const appError = $('app-error');
const appErrorMsg = $('app-error-msg');

// batch (list + summary)
const listEl = $('list');
const batchSummary = $('batch-summary');
const sumFrom = $('sum-from');
const sumTo = $('sum-to');
const sumSave = $('sum-save');
const dlAll = $<HTMLButtonElement>('dl-all');
const sumNote = $('sum-note');

// controls (global, shared)
const fmts = $('fmts');
const fmtNote = $('fmt-note');
const qualitySec = $('quality-sec');
const qEl = $<HTMLInputElement>('quality');
const qVal = $('qval');
const flattenSec = $('flatten-sec');
const fillHex = $('fill-hex');
const fillCustom = $<HTMLInputElement>('fill-custom');
const resizeState = $('resize-state');
const rzW = $<HTMLInputElement>('rz-w');
const rzH = $<HTMLInputElement>('rz-h');
const rzP = $<HTMLInputElement>('rz-p');
const rzPv = $('rz-p-v');
const resizeOut = $('resize-out');

// ---- state ----
interface RowRefs {
  el: HTMLElement;
  thumb: HTMLImageElement;
  fn: HTMLElement;
  fmeta: HTMLElement;
  status: HTMLElement;
  dl: HTMLButtonElement;
}
interface Item {
  id: number;
  file: File;
  name: string;
  originalUrl: string;
  origW: number;
  origH: number;
  origSize: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  hasAlpha: boolean;
  encoded?: Blob;
  encodedUrl?: string;
  encodedSize?: number;
  outName?: string;
  error?: string;
  jobId: number;
  row?: RowRefs;
}

const items: Item[] = [];
let activeId: number | null = null;
let idSeq = 0;
let jobSeq = 0;

// global settings
let format: OutputFormat = 'webp';
let fillColor = '#ffffff';
let scale = 1; // resize (0 < scale ≤ 1); never upscales
let originalW = 0; // reference dims for the resize fields (active or first item)
let originalH = 0;

const pool = new EncodePool();
let reencodeTimer: number | undefined;

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const revoke = (u: string | undefined | null) => {
  if (u) URL.revokeObjectURL(u);
};

function detailItem(): Item | undefined {
  if (activeId !== null) return items.find((i) => i.id === activeId);
  return items.length === 1 ? items[0] : undefined;
}
const isActive = (it: Item) => detailItem() === it;
const targetFor = (iw: number, ih: number) =>
  scale >= 1 || !iw || !ih
    ? null
    : { tw: Math.max(1, Math.round(iw * scale)), th: Math.max(1, Math.round(ih * scale)) };

/* ---------- controls UI ---------- */
function updateFlattenUI(): void {
  let relevant = false;
  if (isOpaqueFormat[format]) {
    const d = detailItem();
    relevant = d ? d.hasAlpha : items.some((i) => i.hasAlpha);
  }
  flattenSec.hidden = !relevant;
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
function setFill(hex: string): void {
  fillColor = hex;
  fillHex.textContent = hex.toUpperCase();
  for (const sw of flattenSec.querySelectorAll<HTMLButtonElement>('.swatch')) {
    sw.setAttribute('aria-pressed', String(sw.dataset.fill?.toLowerCase() === hex.toLowerCase()));
  }
}
/** Reflect current scale onto the resize fields against the reference dims. */
function syncResizeFields(): void {
  const minScale = 1 / Math.max(originalW, originalH, 1);
  scale = Math.min(1, Math.max(minScale, scale));
  const tw = Math.max(1, Math.round(originalW * scale));
  const th = Math.max(1, Math.round(originalH * scale));
  const pct = Math.round(scale * 100);
  rzW.value = String(tw);
  rzH.value = String(th);
  rzP.value = String(pct);
  rzPv.textContent = `${pct}%`;
  if (scale >= 1 || !originalW) {
    resizeState.textContent = 'Original';
    resizeOut.textContent = originalW ? `No resize · ${originalW} × ${originalH}` : '—';
  } else {
    resizeState.textContent = `${tw} × ${th}`;
    resizeOut.textContent = `${originalW} × ${originalH} → ${tw} × ${th}`;
  }
}
function setScale(s: number): void {
  scale = Math.min(1, Math.max(1 / Math.max(originalW, originalH, 1), s));
  syncResizeFields();
}

/* ---------- render ---------- */
function render(): void {
  if (items.length === 0) {
    show(hero, true);
    show(app, false);
    app.setAttribute('aria-hidden', 'true');
    return;
  }
  show(hero, false);
  show(app, true);
  app.setAttribute('aria-hidden', 'false');

  const d = detailItem();
  const ref = d ?? items[0];
  originalW = ref?.origW ?? 0;
  originalH = ref?.origH ?? 0;
  syncResizeFields();
  updateFormatUI();

  if (d) {
    show(cmp, true);
    show(listEl, false);
    show(detailReadout, true);
    show(batchSummary, false);
    show(addMore, items.length === 1);
    show(backToBatch, activeId !== null && items.length > 1);
    show(startOverBtn, true);
    renderDetail(d);
  } else {
    show(cmp, false);
    show(listEl, true);
    show(detailReadout, false);
    show(batchSummary, true);
    show(addMore, true);
    show(backToBatch, false);
    show(startOverBtn, true);
    appError.hidden = true;
    vName.textContent = `${items.length} images`;
    vDims.textContent =
      `${format.toUpperCase()}` +
      (isLossy[format] ? ` · q${qEl.value}` : '') +
      (scale < 1 ? ` · ${Math.round(scale * 100)}%` : '');
    renderSummary();
  }
}

function renderDetail(it: Item): void {
  vName.textContent = it.name;
  vDims.textContent = `${it.origW || '?'} × ${it.origH || '?'} · ${fmtBytes(it.origSize)}`;
  if (it.origW && it.origH) cmp.style.setProperty('--ar', `${it.origW} / ${it.origH}`);
  imgBefore.src = it.originalUrl;
  imgAfter.src = it.encodedUrl ?? it.originalUrl;
  rFrom.textContent = fmtBytes(it.origSize);

  appError.hidden = it.status !== 'error';
  if (it.status === 'error') appErrorMsg.textContent = it.error || 'Encode failed';

  const busy = it.status === 'queued' || it.status === 'processing';
  bar.hidden = !busy;
  if (busy) {
    rSav.className = 'savings muted';
    rSav.textContent = `Encoding ${format.toUpperCase()}…`;
    rTo.textContent = '…';
    dl.disabled = true;
  } else if (it.status === 'done' && it.encodedSize != null) {
    rTo.textContent = fmtBytes(it.encodedSize);
    const pct = Math.round((1 - it.encodedSize / it.origSize) * 100);
    if (pct >= 0) {
      rSav.className = 'savings';
      rSav.textContent = `↓ ${pct}% smaller`;
    } else {
      rSav.className = 'savings neg';
      rSav.textContent = `↑ ${Math.abs(pct)}% larger — keep original`;
    }
    dl.disabled = false;
  } else {
    rTo.textContent = '—';
    rSav.className = 'savings muted';
    rSav.textContent = '—';
    dl.disabled = true;
  }
}

function renderSummary(): void {
  const done = items.filter((i) => i.status === 'done' && i.encodedSize != null);
  const fromB = done.reduce((s, i) => s + i.origSize, 0);
  const toB = done.reduce((s, i) => s + (i.encodedSize as number), 0);
  sumFrom.textContent = fmtBytes(fromB);
  sumTo.textContent = fmtBytes(toB);
  const pct = fromB ? Math.round((1 - toB / fromB) * 100) : 0;
  if (done.length) {
    sumSave.className = 'savings' + (pct < 0 ? ' neg' : '');
    sumSave.textContent = `${pct >= 0 ? '↓' : '↑'} ${Math.abs(pct)}% · ${done.length} of ${items.length} done`;
  } else {
    sumSave.className = 'savings muted';
    sumSave.textContent = `0 of ${items.length} done`;
  }
  dlAll.disabled = done.length === 0;
  const errs = items.filter((i) => i.status === 'error').length;
  sumNote.textContent = errs
    ? `${errs} file${errs > 1 ? 's' : ''} couldn’t be processed — skipped in the zip`
    : done.length < items.length
      ? 'Zips the finished files'
      : '';
}

/* ---------- rows ---------- */
const DL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>';

function createRow(it: Item): void {
  const el = document.createElement('div');
  el.className = 'frow';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.innerHTML =
    '<img class="thumb" alt="" /><div class="finfo"><div class="fn"></div><div class="fmeta mono"></div></div>' +
    '<span class="status"></span>' +
    `<button class="rowbtn dl" type="button" aria-label="Download">${DL_ICON}</button>` +
    '<span class="chev" aria-hidden="true">›</span>';
  const row: RowRefs = {
    el,
    thumb: el.querySelector('.thumb') as HTMLImageElement,
    fn: el.querySelector('.fn') as HTMLElement,
    fmeta: el.querySelector('.fmeta') as HTMLElement,
    status: el.querySelector('.status') as HTMLElement,
    dl: el.querySelector('.dl') as HTMLButtonElement,
  };
  it.row = row;
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openDetail(it);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail(it);
    }
  });
  row.dl.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadItem(it);
  });
  row.status.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.retry')) {
      e.stopPropagation();
      void encodeItem(it);
    }
  });
  listEl.appendChild(el);
  updateRow(it);
}

function updateRow(it: Item): void {
  const row = it.row;
  if (!row) return;
  row.thumb.src = it.originalUrl;
  row.fn.textContent = it.name;
  row.fmeta.classList.toggle('err', it.status === 'error');
  if (it.status === 'error') {
    row.fmeta.textContent = it.error || 'Couldn’t process this file';
    row.status.innerHTML = '<button class="retry" type="button">Retry</button>';
    row.dl.hidden = true;
  } else if (it.status === 'queued') {
    row.fmeta.textContent = it.origW ? `${it.origW} × ${it.origH}` : 'Waiting…';
    row.status.innerHTML = '<span class="pill queued mono">Queued</span>';
    row.dl.hidden = true;
  } else if (it.status === 'processing') {
    row.fmeta.textContent = 'Encoding…';
    row.status.innerHTML = '<span class="rowprog"><span class="track"><span></span></span></span>';
    row.dl.hidden = true;
  } else {
    const from = it.origSize;
    const to = it.encodedSize ?? 0;
    row.fmeta.textContent = `${it.origW} × ${it.origH} · ${fmtBytes(from)} → ${fmtBytes(to)} · ${format.toUpperCase()}`;
    const pct = Math.round((1 - to / from) * 100);
    row.status.innerHTML =
      pct >= 0
        ? `<span class="pill done mono">↓ ${pct}%</span>`
        : `<span class="pill warn mono">larger · kept</span>`;
    row.dl.hidden = false;
  }
}

/* ---------- encode ---------- */
function loadDims(it: Item): Promise<void> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      it.origW = im.naturalWidth;
      it.origH = im.naturalHeight;
      resolve();
    };
    im.onerror = () => resolve();
    im.src = it.originalUrl;
  });
}

async function encodeItem(it: Item): Promise<void> {
  const my = ++jobSeq;
  it.jobId = my;
  it.status = 'queued';
  updateRow(it);
  if (isActive(it)) renderDetail(it);

  let bytes: ArrayBuffer;
  try {
    bytes = await it.file.arrayBuffer();
  } catch {
    it.status = 'error';
    it.error = 'Could not read this file';
    updateRow(it);
    if (isActive(it)) renderDetail(it);
    renderSummary();
    return;
  }
  if (it.jobId !== my) return;

  const t = targetFor(it.origW, it.origH);
  const req: EncodeRequest = {
    id: my,
    bytes,
    type: it.file.type,
    format,
    quality: Number(qEl.value),
    fillColor,
    targetWidth: t?.tw,
    targetHeight: t?.th,
  };
  const res = await pool.submit(req, () => {
    if (it.jobId === my) {
      it.status = 'processing';
      updateRow(it);
      if (isActive(it)) renderDetail(it);
    }
  });
  if (it.jobId !== my) return; // superseded by a newer encode of this item

  if (!res.ok) {
    it.status = 'error';
    it.error = res.error;
  } else {
    revoke(it.encodedUrl);
    it.encoded = new Blob([res.bytes], { type: mimeFor[format] });
    it.encodedUrl = URL.createObjectURL(it.encoded);
    it.encodedSize = res.size;
    it.hasAlpha = res.hasAlpha;
    it.status = 'done';
    it.outName = `${baseName(it.name)}.${extFor[format]}`;
  }
  updateRow(it);
  if (isActive(it)) renderDetail(it);
  renderSummary();
  updateFlattenUI();
}

function reencodeAll(): void {
  for (const it of items) void encodeItem(it);
}
function scheduleReencode(): void {
  window.clearTimeout(reencodeTimer);
  reencodeTimer = window.setTimeout(reencodeAll, 220);
}

/* ---------- add / navigate / download ---------- */
function addFiles(files: FileList | File[]): void {
  const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!incoming.length) {
    if (items.length === 0) {
      errorMsg.textContent = `No readable images there. Try JPEG, PNG, WebP, AVIF or GIF.`;
      errorBox.hidden = false;
    }
    return;
  }
  errorBox.hidden = true;
  for (const file of incoming) {
    const it: Item = {
      id: ++idSeq,
      file,
      name: file.name,
      originalUrl: URL.createObjectURL(file),
      origW: 0,
      origH: 0,
      origSize: file.size,
      status: 'queued',
      hasAlpha: false,
      jobId: 0,
    };
    items.push(it);
    createRow(it);
    void loadDims(it).then(() => {
      updateRow(it);
      if (isActive(it)) renderDetail(it);
      if (items[0] === it) {
        originalW = it.origW;
        originalH = it.origH;
        syncResizeFields();
      }
      void encodeItem(it);
    });
  }
  render();
}

function openDetail(it: Item): void {
  activeId = it.id;
  render();
  app.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}
function backToBatchView(): void {
  activeId = null;
  render();
}
function startOver(): void {
  for (const it of items) {
    revoke(it.originalUrl);
    revoke(it.encodedUrl);
  }
  items.length = 0;
  activeId = null;
  listEl.innerHTML = '';
  fileInput.value = '';
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
}

function downloadItem(it: Item): void {
  if (!it.encodedUrl || !it.outName) return;
  const a = document.createElement('a');
  a.href = it.encodedUrl;
  a.download = it.outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadZip(): Promise<void> {
  const done = items.filter((i) => i.status === 'done' && i.encoded && i.outName);
  if (!done.length) return;
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const it of done) {
    let name = it.outName as string;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let k = 2;
      while (used.has(`${stem} (${k})${ext}`)) k++;
      name = `${stem} (${k})${ext}`;
    }
    used.add(name);
    files[name] = new Uint8Array(await (it.encoded as Blob).arrayBuffer());
  }
  const { zip } = await import('fflate');
  zip(files, { level: 0 }, (err, data) => {
    if (err) return;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'squish.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
}

/* ---------- comparison slider ---------- */
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

/* ---------- controls wiring ---------- */
fmts.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!btn || !btn.dataset.fmt) return;
  format = btn.dataset.fmt as OutputFormat;
  updateFormatUI();
  render();
  reencodeAll();
});
qEl.addEventListener('input', () => {
  qVal.textContent = qEl.value;
  scheduleReencode();
});
rzP.addEventListener('input', () => {
  setScale(Number(rzP.value) / 100);
  scheduleReencode();
});
function commitDim(el: HTMLInputElement, original: number): void {
  const v = Number(el.value);
  if (original && Number.isFinite(v) && v > 0) setScale(v / original);
  else syncResizeFields();
  reencodeAll();
}
rzW.addEventListener('change', () => commitDim(rzW, originalW));
rzH.addEventListener('change', () => commitDim(rzH, originalH));
flattenSec.addEventListener('click', (e) => {
  const sw = (e.target as HTMLElement).closest<HTMLButtonElement>('.swatch');
  if (!sw || !sw.dataset.fill) return;
  setFill(sw.dataset.fill);
  reencodeAll();
});
fillCustom.addEventListener('input', () => {
  setFill(fillCustom.value);
  scheduleReencode();
});

dl.addEventListener('click', () => {
  const d = detailItem();
  if (d) downloadItem(d);
});
dlAll.addEventListener('click', () => void downloadZip());

/* ---------- file inputs & nav ---------- */
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
  if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = '';
});
addMore.addEventListener('click', () => fileInput.click());
backToBatch.addEventListener('click', backToBatchView);
startOverBtn.addEventListener('click', startOver);

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
    if (ev === 'drop' && (e as DragEvent).dataTransfer?.files.length) {
      addFiles((e as DragEvent).dataTransfer!.files);
    }
  }),
);

/* ---------- theme ---------- */
$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const current =
    root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
});
