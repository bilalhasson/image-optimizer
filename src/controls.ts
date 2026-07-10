import type { OutputFormat } from './codecs';
import { state, detailItem } from './state';
import {
  fmts, qEl, qVal, qMode, targetKb, rzP, rzW, rzH, flattenSec, fillCustom, dl, dlAll,
  pick, drop, fileInput, addMore, backToBatch, startOverBtn, themeBtn,
} from './dom';
import {
  updateFormatUI, updateQualityModeUI, render, setScale, setFill, syncResizeFields, syncTargetUI,
  backToBatchView, startOver,
} from './render';
import { reencodeAll, scheduleReencode } from './encode';
import { intake } from './intake';
import { downloadItem, downloadZip } from './download';

/* ---------- format / quality / target ---------- */
fmts.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!btn || !btn.dataset.fmt) return;
  state.format = btn.dataset.fmt as OutputFormat;
  updateFormatUI();
  render();
  reencodeAll();
});
qEl.addEventListener('input', () => {
  qVal.textContent = qEl.value;
  scheduleReencode();
});
qMode.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!btn || !btn.dataset.qmode) return;
  state.qmode = btn.dataset.qmode as 'quality' | 'target';
  updateQualityModeUI();
  render();
  reencodeAll();
});
targetKb.addEventListener('input', () => {
  syncTargetUI();
  scheduleReencode();
});

/* ---------- resize ---------- */
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
rzW.addEventListener('change', () => commitDim(rzW, state.originalW));
rzH.addEventListener('change', () => commitDim(rzH, state.originalH));

/* ---------- transparency fill ---------- */
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

/* ---------- downloads ---------- */
dl.addEventListener('click', () => {
  const d = detailItem();
  if (d) downloadItem(d);
});
dlAll.addEventListener('click', () => void downloadZip());

/* ---------- file inputs & nav ---------- */
pick.addEventListener('click', (e) => {
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
  // Snapshot the files, and clear the input only AFTER intake has read them —
  // clearing mid-read detaches the File objects and makes the async byte sniffs fail.
  const picked = fileInput.files ? Array.from(fileInput.files) : [];
  if (picked.length) void intake(picked).finally(() => (fileInput.value = ''));
  else fileInput.value = '';
});
addMore.addEventListener('click', () => fileInput.click());
backToBatch.addEventListener('click', backToBatchView);
startOverBtn.addEventListener('click', startOver);

/* ---------- drag & drop ---------- */
/** True only if the drag definitively carries a non-image file (type is known & not image/*). */
function dragHasUnsupported(e: DragEvent): boolean {
  const dtItems = e.dataTransfer?.items;
  if (!dtItems) return false;
  return Array.from(dtItems).some((i) => i.kind === 'file' && i.type !== '' && !i.type.startsWith('image/'));
}
(['dragenter', 'dragover'] as const).forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    const bad = dragHasUnsupported(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = bad ? 'none' : 'copy';
    drop.classList.toggle('err', bad);
    drop.classList.toggle('drag', !bad);
  }),
);
drop.addEventListener('dragleave', () => {
  drop.classList.remove('drag', 'err');
});
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  const files = (e as DragEvent).dataTransfer?.files;
  if (files && files.length) void intake(files); // intake sets/clears the error state
});

/* ---------- theme ---------- */
themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const current =
    root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
});
