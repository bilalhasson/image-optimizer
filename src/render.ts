import { isLossy, isOpaqueFormat } from './codecs';
import { state, detailItem, isActive, type Item } from './state';
import { fmtBytes, revoke, reduceMotion } from './format';
import { encodeItem } from './encode';
import { downloadItem } from './download';
import {
  show, hero, app, cmp, listEl, detailReadout, batchSummary, addMore, backToBatch, startOverBtn,
  vName, vDims, imgBefore, imgAfter, rFrom, rTo, rSav, bar, dl, appError, appErrorMsg,
  sumFrom, sumTo, sumSave, dlAll, sumNote, flattenSec, fmts, fmtNote, qualitySec, qMode,
  qualityBlock, targetBlock, qEl, targetKb, targetVal, fillHex, resizeState, rzW, rzH, rzP, rzPv,
  resizeOut, fileInput,
} from './dom';

/* ---------- derived helpers ---------- */
export const targeting = () => state.qmode === 'target' && isLossy[state.format];
export const targetLabel = () => fmtBytes(Number(targetKb.value) * 1024);
/** Aspect-locked target dims from the resize scale. null = keep original (scale ≥ 1). */
export const targetFor = (iw: number, ih: number) =>
  state.scale >= 1 || !iw || !ih
    ? null
    : { tw: Math.max(1, Math.round(iw * state.scale)), th: Math.max(1, Math.round(ih * state.scale)) };

/* ---------- controls UI ---------- */
export function updateFlattenUI(): void {
  let relevant = false;
  if (isOpaqueFormat[state.format]) {
    const d = detailItem();
    relevant = d ? d.hasAlpha : state.items.some((i) => i.hasAlpha);
  }
  flattenSec.hidden = !relevant;
}
export function updateFormatUI(): void {
  for (const chip of fmts.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.fmt === state.format));
  }
  qualitySec.classList.toggle('disabled', !isLossy[state.format]);
  if (state.format === 'avif') {
    fmtNote.textContent = 'AVIF encodes slower — especially on mobile.';
    fmtNote.hidden = false;
  } else if (state.format === 'png') {
    fmtNote.textContent = 'PNG is lossless — quality doesn’t apply.';
    fmtNote.hidden = false;
  } else {
    fmtNote.hidden = true;
  }
  updateQualityModeUI();
  updateFlattenUI();
}
export function updateQualityModeUI(): void {
  for (const chip of qMode.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.qmode === state.qmode));
  }
  qualityBlock.hidden = state.qmode !== 'quality';
  targetBlock.hidden = state.qmode !== 'target';
}
/** Target slider range maxes at the reference image's original size; keeps the value in range. */
export function syncTargetUI(): void {
  const maxKB = Math.max(10, Math.ceil(state.refBytes / 1024) || 1000);
  targetKb.max = String(maxKB);
  let v = Number(targetKb.value) || 0;
  v = Math.min(maxKB, Math.max(5, v || Math.round(maxKB / 2)));
  targetKb.value = String(v);
  targetVal.textContent = fmtBytes(v * 1024);
}
export function setFill(hex: string): void {
  state.fillColor = hex;
  fillHex.textContent = hex.toUpperCase();
  for (const sw of flattenSec.querySelectorAll<HTMLButtonElement>('.swatch')) {
    sw.setAttribute('aria-pressed', String(sw.dataset.fill?.toLowerCase() === hex.toLowerCase()));
  }
}
/** Reflect current scale onto the resize fields against the reference dims. */
export function syncResizeFields(): void {
  const minScale = 1 / Math.max(state.originalW, state.originalH, 1);
  state.scale = Math.min(1, Math.max(minScale, state.scale));
  const tw = Math.max(1, Math.round(state.originalW * state.scale));
  const th = Math.max(1, Math.round(state.originalH * state.scale));
  const pct = Math.round(state.scale * 100);
  rzW.value = String(tw);
  rzH.value = String(th);
  rzP.value = String(pct);
  rzPv.textContent = `${pct}%`;
  if (state.scale >= 1 || !state.originalW) {
    resizeState.textContent = 'Original';
    resizeOut.textContent = state.originalW ? `No resize · ${state.originalW} × ${state.originalH}` : '—';
  } else {
    resizeState.textContent = `${tw} × ${th}`;
    resizeOut.textContent = `${state.originalW} × ${state.originalH} → ${tw} × ${th}`;
  }
}
export function setScale(s: number): void {
  state.scale = Math.min(1, Math.max(1 / Math.max(state.originalW, state.originalH, 1), s));
  syncResizeFields();
}

/* ---------- render ---------- */
export function render(): void {
  if (state.items.length === 0) {
    show(hero, true);
    show(app, false);
    app.setAttribute('aria-hidden', 'true');
    return;
  }
  show(hero, false);
  show(app, true);
  app.setAttribute('aria-hidden', 'false');

  const d = detailItem();
  const ref = d ?? state.items[0];
  state.originalW = ref?.origW ?? 0;
  state.originalH = ref?.origH ?? 0;
  state.refBytes = ref?.origSize ?? 0;
  syncResizeFields();
  syncTargetUI();
  updateFormatUI();

  if (d) {
    show(cmp, true);
    show(listEl, false);
    show(detailReadout, true);
    show(batchSummary, false);
    show(addMore, state.items.length === 1);
    show(backToBatch, state.activeId !== null && state.items.length > 1);
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
    vName.textContent = `${state.items.length} images`;
    vDims.textContent =
      `${state.format.toUpperCase()}` +
      (isLossy[state.format] ? (targeting() ? ` · ≤ ${targetLabel()}` : ` · q${qEl.value}`) : '') +
      (state.scale < 1 ? ` · ${Math.round(state.scale * 100)}%` : '');
    renderSummary();
  }
}

export function renderDetail(it: Item): void {
  vName.textContent = it.name;
  vDims.textContent = `${it.origW || '?'} × ${it.origH || '?'} · ${fmtBytes(it.origSize)}`;
  if (it.origW && it.origH) cmp.style.setProperty('--ar', `${it.origW} / ${it.origH}`);
  if (it.originalUrl) {
    imgBefore.src = it.originalUrl;
    imgAfter.src = it.encodedUrl ?? it.originalUrl;
  } else {
    imgBefore.removeAttribute('src');
    imgAfter.removeAttribute('src');
  }
  rFrom.textContent = fmtBytes(it.origSize);

  appError.hidden = it.status !== 'error';
  if (it.status === 'error') appErrorMsg.textContent = it.error || 'Encode failed';

  const busy = it.status === 'queued' || it.status === 'processing';
  bar.hidden = !busy;
  if (busy) {
    rSav.className = 'savings muted';
    rSav.textContent = it.stageLabel || `Encoding ${state.format.toUpperCase()}…`;
    rTo.textContent = '…';
    dl.disabled = true;
  } else if (it.status === 'done' && it.encodedSize != null) {
    rTo.textContent = fmtBytes(it.encodedSize);
    const pct = Math.round((1 - it.encodedSize / it.origSize) * 100);
    if (targeting() && it.reached === false) {
      rSav.className = 'savings neg';
      rSav.textContent = `can’t reach ${targetLabel()} — smallest is ${fmtBytes(it.encodedSize)}`;
    } else if (pct >= 0) {
      rSav.className = 'savings';
      rSav.textContent = targeting() ? `↓ ${pct}% · q${it.encQuality}` : `↓ ${pct}% smaller`;
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

export function renderSummary(): void {
  const done = state.items.filter((i) => i.status === 'done' && i.encodedSize != null);
  const fromB = done.reduce((s, i) => s + i.origSize, 0);
  const toB = done.reduce((s, i) => s + (i.encodedSize as number), 0);
  sumFrom.textContent = fmtBytes(fromB);
  sumTo.textContent = fmtBytes(toB);
  const pct = fromB ? Math.round((1 - toB / fromB) * 100) : 0;
  if (done.length) {
    sumSave.className = 'savings' + (pct < 0 ? ' neg' : '');
    sumSave.textContent = `${pct >= 0 ? '↓' : '↑'} ${Math.abs(pct)}% · ${done.length} of ${state.items.length} done`;
  } else {
    sumSave.className = 'savings muted';
    sumSave.textContent = `0 of ${state.items.length} done`;
  }
  dlAll.disabled = done.length === 0;
  const errs = state.items.filter((i) => i.status === 'error').length;
  sumNote.textContent = errs
    ? `${errs} file${errs > 1 ? 's' : ''} couldn’t be processed — skipped in the zip`
    : done.length < state.items.length
      ? 'Zips the finished files'
      : '';
}

/* ---------- rows ---------- */
const DL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>';

export function createRow(it: Item): void {
  const el = document.createElement('div');
  el.className = 'frow';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.innerHTML =
    '<img class="thumb" alt="" /><div class="finfo"><div class="fn"></div><div class="fmeta mono"></div></div>' +
    '<span class="status"></span>' +
    `<button class="rowbtn dl" type="button" aria-label="Download">${DL_ICON}</button>` +
    '<span class="chev" aria-hidden="true">›</span>';
  const row = {
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

export function updateRow(it: Item): void {
  const row = it.row;
  if (!row) return;
  if (it.originalUrl) row.thumb.src = it.originalUrl;
  else row.thumb.removeAttribute('src');
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
    row.fmeta.textContent = it.stageLabel || 'Encoding…';
    row.status.innerHTML = '<span class="rowprog"><span class="track"><span></span></span></span>';
    row.dl.hidden = true;
  } else {
    const from = it.origSize;
    const to = it.encodedSize ?? 0;
    row.fmeta.textContent = `${it.origW} × ${it.origH} · ${fmtBytes(from)} → ${fmtBytes(to)} · ${state.format.toUpperCase()}`;
    const pct = Math.round((1 - to / from) * 100);
    if (targeting() && it.reached === false) {
      row.status.innerHTML = `<span class="pill warn mono">over ${targetLabel()}</span>`;
    } else {
      row.status.innerHTML =
        pct >= 0
          ? `<span class="pill done mono">↓ ${pct}%</span>`
          : `<span class="pill warn mono">larger · kept</span>`;
    }
    row.dl.hidden = false;
  }
}

/** Mark an item failed and refresh its views. */
export function failItem(it: Item, message: string): void {
  it.status = 'error';
  it.error = message;
  updateRow(it);
  if (isActive(it)) renderDetail(it);
  renderSummary();
}

/* ---------- navigation ---------- */
export function openDetail(it: Item): void {
  state.activeId = it.id;
  render();
  app.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}
export function backToBatchView(): void {
  state.activeId = null;
  render();
}
export function startOver(): void {
  for (const it of state.items) {
    revoke(it.originalUrl);
    revoke(it.encodedUrl);
  }
  state.items.length = 0;
  state.activeId = null;
  listEl.innerHTML = '';
  fileInput.value = '';
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
}
