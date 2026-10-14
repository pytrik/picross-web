import workerSource from './generate.worker.ts?worker';
import { generatePuzzle, type GenerateOptions } from '../puzzle/generator.ts';
import type { PuzzleDef } from '../puzzle/types.ts';
import type { WorkerReply } from './generate.worker.ts';

export class GenerateError extends Error {}

let workerUrl: string | null = null;

/**
 * Generates off the main thread (SPEC §5.2). Rejects with GenerateError on
 * timeout, or an AbortError when `signal` aborts (the worker is terminated).
 * Falls back to the main thread if workers are unavailable.
 */
export function generateInWorker(opts: GenerateOptions, signal?: AbortSignal): Promise<PuzzleDef> {
  let worker: Worker;
  try {
    workerUrl ??= URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    worker = new Worker(workerUrl);
  } catch {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const def = generatePuzzle(opts);
        if (def) resolve(def);
        else reject(new GenerateError('timeout'));
      });
    });
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Generation cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      const reply = event.data;
      if (reply.ok) resolve({ width: reply.width, height: reply.height, palette: reply.palette, cells: reply.cells });
      else reject(new GenerateError(reply.error));
    };
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      reject(new GenerateError(event.message || 'Worker failed'));
    };
    // Snapshot plain data: Svelte state proxies can't be structured-cloned.
    worker.postMessage({ ...opts, palette: [...opts.palette] });
  });
}
