import { generatePuzzle, type GenerateOptions } from '../puzzle/generator.ts';

export type WorkerReply =
  | { ok: true; width: number; height: number; palette: string[]; cells: Uint8Array }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<GenerateOptions>) => {
  let reply: WorkerReply;
  try {
    const def = generatePuzzle(event.data);
    reply = def ? { ok: true, ...def } : { ok: false, error: 'timeout' };
  } catch (err) {
    reply = { ok: false, error: String(err) };
  }
  self.postMessage(reply);
};
