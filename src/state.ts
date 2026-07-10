import type { OutputFormat } from './codecs';

/** DOM handles cached on each batch row so we can update it in place. */
export interface RowRefs {
  el: HTMLElement;
  thumb: HTMLImageElement;
  fn: HTMLElement;
  fmeta: HTMLElement;
  status: HTMLElement;
  dl: HTMLButtonElement;
}

/** One image in the session (single or batch). */
export interface Item {
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
  encQuality?: number;
  reached?: boolean; // target-size mode: did we fit under the budget?
  outName?: string;
  error?: string;
  stageLabel?: string; // transient processing label, e.g. "Converting HEIC…"
  jobId: number;
  row?: RowRefs;
}

export type QMode = 'quality' | 'target';

interface AppState {
  items: Item[];
  activeId: number | null; // which item is open in the detail view (null = batch list)
  idSeq: number;
  jobSeq: number;
  // global settings, applied to every item
  format: OutputFormat;
  fillColor: string;
  qmode: QMode;
  scale: number; // 0 < scale ≤ 1; never upscales
  originalW: number; // reference dims for the resize fields (active or first item)
  originalH: number;
  refBytes: number; // reference original size, drives the target-size slider max
}

export const state: AppState = {
  items: [],
  activeId: null,
  idSeq: 0,
  jobSeq: 0,
  format: 'webp',
  fillColor: '#ffffff',
  qmode: 'quality',
  scale: 1,
  originalW: 0,
  originalH: 0,
  refBytes: 0,
};

/** The item shown in the detail view: the explicitly-opened one, or the sole item. */
export function detailItem(): Item | undefined {
  if (state.activeId !== null) return state.items.find((i) => i.id === state.activeId);
  return state.items.length === 1 ? state.items[0] : undefined;
}
export const isActive = (it: Item) => detailItem() === it;
