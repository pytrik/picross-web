import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARK_X } from '../puzzle/types.ts';
import { History } from './history.ts';
import { MAX_ENTRIES, clearProgress, loadProgress, saveProgress } from './progress.ts';
import type { KV } from './storage.ts';

function memoryStorage(limit = Infinity): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (!map.has(k) && map.size >= limit) throw new DOMException('full', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

const progress = (board: number[], solved = false) => ({
  board: Uint8Array.from(board),
  elapsedMs: 1234,
  checks: 2,
  solved,
});

test('progress round-trips including X marks', () => {
  const s = memoryStorage();
  const p = progress([0, 1, 3, MARK_X, 2, MARK_X]);
  saveProgress(s, 'k', 3, p);
  assert.deepEqual(loadProgress(s, 'k', 3, 6), p);
  assert.equal(loadProgress(s, 'missing', 3, 6), null);
  assert.equal(loadProgress(s, 'k', 3, 9), null, 'wrong size rejected');
});

test('empty unsolved boards are not stored', () => {
  const s = memoryStorage();
  saveProgress(s, 'k', 1, progress([1, 0]));
  saveProgress(s, 'k', 1, progress([0, 0]));
  assert.equal(loadProgress(s, 'k', 1, 2), null);
  clearProgress(s, 'k');
  assert.equal(s.map.get('picross:index'), '[]');
});

test('LRU keeps the most recent entries', () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) saveProgress(s, `k${i}`, 1, progress([1]), 1000 + i);
  assert.equal(loadProgress(s, 'k0', 1, 1), null);
  assert.equal(loadProgress(s, 'k4', 1, 1), null);
  assert.ok(loadProgress(s, 'k5', 1, 1));
  assert.equal(JSON.parse(s.map.get('picross:index')!).length, MAX_ENTRIES);
});

test('quota errors evict old entries and retry', () => {
  const s = memoryStorage(13); // index + 12 records
  for (let i = 0; i < 12; i++) saveProgress(s, `k${i}`, 1, progress([1]), 1000 + i);
  saveProgress(s, 'new', 1, progress([1]), 5000);
  assert.ok(loadProgress(s, 'new', 1, 1));
  assert.equal(loadProgress(s, 'k0', 1, 1), null);
});

test('history undo/redo', () => {
  const h = new History();
  h.push({ cells: [1], before: [0], after: [2] });
  h.push({ cells: [], before: [], after: [] });
  assert.ok(h.canUndo && !h.canRedo);
  assert.deepEqual(h.undo()?.cells, [1]);
  assert.ok(!h.canUndo && h.canRedo);
  assert.deepEqual(h.redo()?.after, [2]);
  h.undo();
  h.push({ cells: [3], before: [0], after: [1] });
  assert.ok(!h.canRedo, 'new change clears redo');
});
