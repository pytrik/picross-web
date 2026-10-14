import { generate, type GenerateOptions } from '../puzzle/generator.ts';
import type { Style } from '../puzzle/styles.ts';

export type WorkerReply =
  | { ok: true; width: number; height: number; palette: string[]; cells: Uint8Array; style: Style }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<GenerateOptions>) => {
  let reply: WorkerReply;
  try {
    const result = generate(event.data);
    reply = result ? { ok: true, ...result.def, style: result.style } : { ok: false, error: 'timeout' };
  } catch (err) {
    reply = { ok: false, error: String(err) };
  }
  self.postMessage(reply);
};
