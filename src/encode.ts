import { extFor, mimeFor } from './codecs';
import type { EncodeRequest } from './worker';
import { EncodePool } from './pool';
import { state, isActive, type Item } from './state';
import { baseName, revoke } from './format';
import { qEl, qVal, targetKb } from './dom';
import { updateRow, renderDetail, renderSummary, updateFlattenUI, targeting, targetFor } from './render';

const pool = new EncodePool();
let reencodeTimer: number | undefined;

/** Oriented dims (EXIF-corrected) so the resize fields / aspect match what we encode. */
export async function loadDims(it: Item): Promise<void> {
  try {
    const bm = await createImageBitmap(it.file, { imageOrientation: 'from-image' });
    it.origW = bm.width;
    it.origH = bm.height;
    bm.close();
  } catch {
    /* dims stay 0; a bad file will surface as an encode error */
  }
}

export async function encodeItem(it: Item): Promise<void> {
  const my = ++state.jobSeq;
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
    format: state.format,
    quality: Number(qEl.value),
    fillColor: state.fillColor,
    targetWidth: t?.tw,
    targetHeight: t?.th,
    targetBytes: targeting() ? Math.max(1, Math.round(Number(targetKb.value) || 0)) * 1024 : undefined,
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
    it.encoded = new Blob([res.bytes], { type: mimeFor[state.format] });
    it.encodedUrl = URL.createObjectURL(it.encoded);
    it.encodedSize = res.size;
    it.encQuality = res.quality;
    it.reached = res.reachedTarget;
    it.hasAlpha = res.hasAlpha;
    it.status = 'done';
    it.outName = `${baseName(it.name)}.${extFor[state.format]}`;
    // In target-size mode, reflect the quality the search landed on back into the slider,
    // so switching to Quality mode continues from there (detail view only — batch is ambiguous).
    if (targeting() && isActive(it)) {
      qEl.value = String(res.quality);
      qVal.textContent = String(res.quality);
    }
  }
  updateRow(it);
  if (isActive(it)) renderDetail(it);
  renderSummary();
  updateFlattenUI();
}

export function reencodeAll(): void {
  for (const it of state.items) void encodeItem(it);
}
export function scheduleReencode(): void {
  window.clearTimeout(reencodeTimer);
  reencodeTimer = window.setTimeout(reencodeAll, 220);
}
