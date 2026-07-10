import { state, isActive, type Item } from './state';
import { drop, errorBox, errorMsg } from './dom';
import { isHeicFile, isAnimated } from './sniff';
import { toast } from './toast';
import { createRow, updateRow, renderDetail, render, syncResizeFields, syncTargetUI, failItem } from './render';
import { encodeItem, loadDims } from './encode';

const MAX_MEGAPIXELS = 256; // hard guard against browser-crashing inputs

/** Reject at the landing drop zone if it's visible; otherwise (app open) show a toast. */
export function rejectDrop(message: string): void {
  if (state.items.length > 0) {
    toast(message);
    return;
  }
  drop.classList.add('err');
  errorMsg.textContent = message;
  errorBox.hidden = false;
}

/** Screen incoming files (non-image types, animated) before admitting them. */
export async function intake(files: FileList | File[]): Promise<void> {
  const arr = Array.from(files);
  const screened = await Promise.all(arr.map(async (f) => ({ f, heic: await isHeicFile(f) })));
  const usable = screened.filter((s) => s.f.type.startsWith('image/') || s.heic);
  const unsupported = screened.length - usable.length;
  // Animation can only be detected once we can read bytes (i.e. now, on drop/pick — never on hover).
  const animatedFlags = await Promise.all(usable.map((s) => isAnimated(s.f)));
  const accepted = usable.filter((_, i) => !animatedFlags[i]);
  const animatedCount = usable.length - accepted.length;

  if (!accepted.length) {
    rejectDrop(
      animatedCount && !unsupported
        ? 'Animated images aren’t supported yet.'
        : `That isn’t an image we can read. Try JPEG, PNG, WebP, AVIF, GIF or HEIC.`,
    );
    return;
  }
  drop.classList.remove('err');
  errorBox.hidden = true;
  const skipped = unsupported + animatedCount;
  if (skipped) toast(`${skipped} file${skipped > 1 ? 's' : ''} skipped — unsupported or animated.`);
  addAccepted(accepted);
}

function refreshRefFrom(it: Item): void {
  if (state.items[0] === it) {
    state.originalW = it.origW;
    state.originalH = it.origH;
    state.refBytes = it.origSize;
    syncResizeFields();
    syncTargetUI();
  }
}

function addAccepted(entries: { f: File; heic: boolean }[]): void {
  for (const { f, heic } of entries) {
    const it: Item = {
      id: ++state.idSeq,
      file: f,
      name: f.name,
      originalUrl: heic ? '' : URL.createObjectURL(f), // HEIC can't be shown until decoded
      origW: 0,
      origH: 0,
      origSize: f.size, // keep the ORIGINAL (HEIC) size for the savings comparison
      status: 'queued',
      hasAlpha: false,
      jobId: 0,
    };
    state.items.push(it);
    createRow(it);
    void (async () => {
      if (heic) {
        it.status = 'processing';
        it.stageLabel = 'Converting HEIC…';
        updateRow(it);
        if (isActive(it)) renderDetail(it);
        try {
          const { heicTo } = await import('heic-to'); // ~1.5 MB decoder, loaded only for HEIC
          const png = (await heicTo({ blob: it.file, type: 'image/png' })) as Blob;
          it.file = new File([png], it.name, { type: 'image/png' });
          it.originalUrl = URL.createObjectURL(png);
        } catch {
          failItem(it, 'Couldn’t decode this HEIC image.');
          return;
        }
        it.stageLabel = undefined;
      }
      await loadDims(it);
      updateRow(it);
      if (isActive(it)) renderDetail(it);
      refreshRefFrom(it);
      if (it.origW && it.origH && it.origW * it.origH > MAX_MEGAPIXELS * 1_000_000) {
        const mp = Math.round((it.origW * it.origH) / 1_000_000);
        failItem(it, `This image is very large (${mp} MP). Resize the original first, then try again.`);
        return;
      }
      void encodeItem(it);
    })();
  }
  render();
}
