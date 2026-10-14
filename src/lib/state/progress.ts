import { bitsFor, fromBase64Url, packValues, toBase64Url, unpackValues } from '../puzzle/codec.ts';
import { MARK_X } from '../puzzle/types.ts';
import { readJson, type KV } from './storage.ts';

/** Player progress for one puzzle (SPEC §7.1). */
export interface Progress {
  board: Uint8Array;
  elapsedMs: number;
  checks: number;
  solved: boolean;
}

interface StoredProgress {
  v: 1;
  board: string;
  elapsedMs: number;
  checks: number;
  solved: boolean;
  updatedAt: number;
}

type IndexEntry = { k: string; t: number };

export const MAX_ENTRIES = 50;
const INDEX_KEY = 'picross:index';
const recordKey = (key: string) => `picross:p:${key}`;

// In storage, X is N+1 so the packed width stays minimal.
const encodeBoard = (board: Uint8Array, colors: number) =>
  toBase64Url(packValues(board.map((v) => (v === MARK_X ? colors + 1 : v)), bitsFor(colors + 1)));

const decodeBoard = (text: string, colors: number, count: number) =>
  unpackValues(fromBase64Url(text), count, bitsFor(colors + 1)).map((v) => (v === colors + 1 ? MARK_X : v));

export function loadProgress(storage: KV | null, key: string, colors: number, cellCount: number): Progress | null {
  const rec = readJson<StoredProgress>(storage, recordKey(key));
  if (!rec || rec.v !== 1) return null;
  try {
    const board = decodeBoard(rec.board, colors, cellCount);
    if (board.some((v) => v > colors && v !== MARK_X)) return null;
    return { board, elapsedMs: rec.elapsedMs || 0, checks: rec.checks || 0, solved: !!rec.solved };
  } catch {
    return null;
  }
}

function readIndex(storage: KV): IndexEntry[] {
  const index = readJson<IndexEntry[]>(storage, INDEX_KEY);
  return Array.isArray(index) ? index.filter((e) => typeof e?.k === 'string') : [];
}

/** Drops the oldest entries until at most `keep` remain. */
function evict(storage: KV, index: IndexEntry[], keep: number): IndexEntry[] {
  index.sort((a, b) => b.t - a.t);
  for (const old of index.slice(keep)) storage.removeItem(recordKey(old.k));
  return index.slice(0, keep);
}

/**
 * Saves progress and updates the LRU index (SPEC §7.3). An unsolved board
 * with no marks is removed instead of stored.
 */
export function saveProgress(storage: KV | null, key: string, colors: number, progress: Progress, now = Date.now()): void {
  if (!storage) return;
  if (!progress.solved && progress.board.every((v) => v === 0)) {
    clearProgress(storage, key);
    return;
  }
  const rec: StoredProgress = {
    v: 1,
    board: encodeBoard(progress.board, colors),
    elapsedMs: Math.round(progress.elapsedMs),
    checks: progress.checks,
    solved: progress.solved,
    updatedAt: now,
  };
  let index = readIndex(storage).filter((e) => e.k !== key);
  index.push({ k: key, t: now });
  index = evict(storage, index, MAX_ENTRIES);

  const write = () => {
    storage.setItem(recordKey(key), JSON.stringify(rec));
    storage.setItem(INDEX_KEY, JSON.stringify(index));
  };
  try {
    write();
  } catch {
    // Probably QuotaExceededError: free the oldest 10 (never this one), retry once.
    try {
      const others = index.filter((e) => e.k !== key);
      index = [...evict(storage, others, Math.max(0, others.length - 10)), { k: key, t: now }];
      write();
    } catch {
      // Still full or blocked: play on without persistence.
    }
  }
}

export function clearProgress(storage: KV | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(recordKey(key));
    storage.setItem(INDEX_KEY, JSON.stringify(readIndex(storage).filter((e) => e.k !== key)));
  } catch {
    // ignore
  }
}
