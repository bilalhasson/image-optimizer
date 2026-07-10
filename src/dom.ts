/** Cached element handles + tiny DOM helpers. Runs at import (module script → DOM is ready). */
export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};
export const show = (el: HTMLElement, on: boolean): void => {
  el.hidden = !on;
};

// landing
export const hero = $('hero');
export const fileInput = $<HTMLInputElement>('file');
export const drop = $('drop');
export const errorBox = $('error');
export const errorMsg = $('error-msg');
export const toastEl = $('toast');
export const pick = $('pick');
export const themeBtn = $('theme');

// app shell
export const app = $('app');
export const vName = $('v-name');
export const vDims = $('v-dims');
export const addMore = $('add-more');
export const backToBatch = $('back-to-batch');
export const startOverBtn = $('start-over');

// detail (comparison + readout)
export const cmp = $('cmp');
export const imgBefore = $<HTMLImageElement>('img-before');
export const imgAfter = $<HTMLImageElement>('img-after');
export const handle = $('handle');
export const detailReadout = $('detail-readout');
export const rFrom = $('r-from');
export const rTo = $('r-to');
export const rSav = $('r-sav');
export const bar = $('bar');
export const dl = $<HTMLButtonElement>('dl');
export const appError = $('app-error');
export const appErrorMsg = $('app-error-msg');

// batch (list + summary)
export const listEl = $('list');
export const batchSummary = $('batch-summary');
export const sumFrom = $('sum-from');
export const sumTo = $('sum-to');
export const sumSave = $('sum-save');
export const dlAll = $<HTMLButtonElement>('dl-all');
export const sumNote = $('sum-note');

// controls (global, shared)
export const fmts = $('fmts');
export const fmtNote = $('fmt-note');
export const qualitySec = $('quality-sec');
export const qEl = $<HTMLInputElement>('quality');
export const qVal = $('qval');
export const qMode = $('q-mode');
export const qualityBlock = $('quality-block');
export const targetBlock = $('target-block');
export const targetKb = $<HTMLInputElement>('target-kb');
export const targetVal = $('target-val');
export const flattenSec = $('flatten-sec');
export const fillHex = $('fill-hex');
export const fillCustom = $<HTMLInputElement>('fill-custom');
export const resizeState = $('resize-state');
export const rzW = $<HTMLInputElement>('rz-w');
export const rzH = $<HTMLInputElement>('rz-h');
export const rzP = $<HTMLInputElement>('rz-p');
export const rzPv = $('rz-p-v');
export const resizeOut = $('resize-out');
