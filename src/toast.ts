import { toastEl } from './dom';

let toastTimer: number | undefined;

/** Brief status message — used for rejections/skips when the drop zone isn't visible. */
export function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 3800);
}
