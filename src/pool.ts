/**
 * Bounded pool of encode workers. Jobs queue and drain across the pool so several
 * images encode in parallel without spawning unbounded WASM instances.
 */
import type { EncodeRequest, EncodeResponse } from './worker';

interface QueueEntry {
  req: EncodeRequest;
  resolve: (res: EncodeResponse) => void;
  onStart?: () => void;
}

/** Sensible default: leave a core for the UI, cap at 4 (AVIF's ~1 MB codec × N is the memory risk). */
export function defaultPoolSize(): number {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(cores - 1, 4));
}

export class EncodePool {
  private idle: Worker[] = [];
  private queue: QueueEntry[] = [];
  private pending = new Map<number, { worker: Worker; resolve: (res: EncodeResponse) => void }>();

  constructor(size: number = defaultPoolSize()) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<EncodeResponse>) => this.onDone(w, e.data);
      this.idle.push(w);
    }
  }

  /** Queue a job. `onStart` fires when a worker actually picks it up (queued → processing). */
  submit(req: EncodeRequest, onStart?: () => void): Promise<EncodeResponse> {
    return new Promise((resolve) => {
      this.queue.push({ req, resolve, onStart });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(job.req.id, { worker, resolve: job.resolve });
      job.onStart?.();
      worker.postMessage(job.req, [job.req.bytes]);
    }
  }

  private onDone(worker: Worker, res: EncodeResponse): void {
    const p = this.pending.get(res.id);
    if (p) {
      this.pending.delete(res.id);
      p.resolve(res);
    }
    this.idle.push(worker);
    this.pump();
  }
}
