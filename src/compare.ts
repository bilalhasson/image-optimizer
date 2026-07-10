import { cmp, handle } from './dom';

/** Before/after comparison slider — self-contained; attaches its own listeners on import. */
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
