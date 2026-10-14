import { colIndices, rowIndices } from './clues.ts';
import { MARK_X, UNKNOWN, type Clue, type Clues } from './types.ts';

/**
 * Cell knowledge is a bitmask of still-possible states: bit 0 = empty,
 * bit k = palette color k.
 */
export const EMPTY_BIT = 1;

export const fullMask = (colors: number) => (1 << (colors + 1)) - 1;

/**
 * Multi-color line solver (SPEC §5.3). Returns, for each cell, the union of
 * states over every placement of `clue` consistent with `masks`, or null if
 * no placement exists.
 *
 * f[i][p]: runs 0..i-1 fit in cells [0,p) (cells not in runs empty).
 * b[i][p]: runs i..k-1 fit in cells [p,n).
 * Same-colored neighbours need an empty cell between them; different colors
 * may touch.
 */
export function solveLine(clue: Clue, masks: ArrayLike<number>): number[] | null {
  const n = masks.length;
  const k = clue.length;
  const canEmpty = (p: number) => (masks[p]! & EMPTY_BIT) !== 0;

  // fits[c][p]: number of cells in [0,p) that allow color bit c (prefix sums),
  // so "cells s..e-1 all allow color c" is an O(1) check.
  const colorBits = new Set(clue.map((r) => r.color));
  const fits = new Map<number, Int32Array>();
  for (const c of colorBits) {
    const pre = new Int32Array(n + 1);
    for (let p = 0; p < n; p++) pre[p + 1] = pre[p]! + ((masks[p]! >> c) & 1);
    fits.set(c, pre);
  }
  const allow = (c: number, s: number, e: number) => {
    const pre = fits.get(c)!;
    return pre[e]! - pre[s]! === e - s;
  };
  const gapBefore = (i: number) => (i > 0 && i < k && clue[i - 1]!.color === clue[i]!.color ? 1 : 0);

  const f = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1));
  f[0]![0] = 1;
  for (let p = 1; p <= n; p++) f[0]![p] = f[0]![p - 1]! && canEmpty(p - 1) ? 1 : 0;
  for (let i = 1; i <= k; i++) {
    const { len, color } = clue[i - 1]!;
    const gap = gapBefore(i - 1);
    const fi = f[i]!;
    const prev = f[i - 1]!;
    for (let p = 1; p <= n; p++) {
      if (fi[p - 1] && canEmpty(p - 1)) {
        fi[p] = 1;
        continue;
      }
      const s = p - len;
      if (s < 0 || !allow(color, s, p)) continue;
      if (gap ? s >= 1 && canEmpty(s - 1) && prev[s - 1] : prev[s]) fi[p] = 1;
    }
  }
  if (!f[k]![n]) return null;

  const b = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1));
  b[k]![n] = 1;
  for (let p = n - 1; p >= 0; p--) b[k]![p] = b[k]![p + 1]! && canEmpty(p) ? 1 : 0;
  for (let i = k - 1; i >= 0; i--) {
    const { len, color } = clue[i]!;
    const gap = gapBefore(i + 1);
    const bi = b[i]!;
    const next = b[i + 1]!;
    for (let p = n - 1; p >= 0; p--) {
      if (bi[p + 1] && canEmpty(p)) {
        bi[p] = 1;
        continue;
      }
      const e = p + len;
      if (e > n || !allow(color, p, e)) continue;
      if (gap ? e < n && canEmpty(e) && next[e + 1] : next[e]) bi[p] = 1;
    }
  }

  const result = new Array<number>(n).fill(0);
  // Empty: cell p empty with runs 0..i-1 left of it and i..k-1 right of it.
  for (let p = 0; p < n; p++) {
    if (!canEmpty(p)) continue;
    for (let i = 0; i <= k; i++) {
      if (f[i]![p] && b[i]![p + 1]) {
        result[p]! |= EMPTY_BIT;
        break;
      }
    }
  }
  // Colors: every valid placement of run i at start s (difference arrays).
  for (let i = 0; i < k; i++) {
    const { len, color } = clue[i]!;
    const gapL = gapBefore(i);
    const gapR = i + 1 < k ? gapBefore(i + 1) : 0;
    const diff = new Int32Array(n + 1);
    for (let s = 0; s + len <= n; s++) {
      const e = s + len;
      if (!allow(color, s, e)) continue;
      const leftOk = gapL ? s >= 1 && canEmpty(s - 1) && f[i]![s - 1] : f[i]![s];
      if (!leftOk) continue;
      const rightOk = gapR ? e < n && canEmpty(e) && b[i + 1]![e + 1] : b[i + 1]![e];
      if (!rightOk) continue;
      diff[s]!++;
      diff[e]!--;
    }
    let run = 0;
    for (let p = 0; p < n; p++) {
      run += diff[p]!;
      if (run > 0) result[p]! |= 1 << color;
    }
  }
  return result;
}

export interface SolveResult {
  /** Final knowledge per cell. */
  masks: Uint8Array;
  /** Every cell determined (single bit). */
  solved: boolean;
  /** Clues are inconsistent. */
  contradiction: boolean;
}

const isSingle = (m: number) => m !== 0 && (m & (m - 1)) === 0;

/** Line-logic only: iterate rows/columns to a fixpoint. No guessing. */
export function solveGrid(clues: Clues, width: number, height: number, colors: number): SolveResult {
  const masks = new Uint8Array(width * height).fill(fullMask(colors));
  const lines: number[][] = [
    ...Array.from({ length: height }, (_, r) => rowIndices(width, r)),
    ...Array.from({ length: width }, (_, c) => colIndices(width, height, c)),
  ];
  const lineClues = [...clues.rows, ...clues.cols];
  const queued = new Uint8Array(lines.length).fill(1);
  const queue = lines.map((_, i) => i);

  while (queue.length) {
    const li = queue.shift()!;
    queued[li] = 0;
    const idx = lines[li]!;
    const possible = solveLine(lineClues[li]!, idx.map((i) => masks[i]!));
    if (!possible) return { masks, solved: false, contradiction: true };
    for (let p = 0; p < idx.length; p++) {
      const cell = idx[p]!;
      const next = masks[cell]! & possible[p]!;
      if (next === masks[cell]) continue;
      if (next === 0) return { masks, solved: false, contradiction: true };
      masks[cell] = next;
      // Changed cell → requeue the perpendicular line.
      const other = li < height ? height + (cell % width) : Math.floor(cell / width);
      if (!queued[other]) {
        queued[other] = 1;
        queue.push(other);
      }
    }
  }
  return { masks, solved: masks.every(isSingle), contradiction: false };
}

/** Converts a fully determined mask grid to solution values. */
export function masksToCells(masks: Uint8Array): Uint8Array {
  return masks.map((m) => (m === EMPTY_BIT ? 0 : Math.log2(m)));
}

export { isSingle };

/**
 * Whether a board line (0 unknown, 1..N color, X) still admits a placement of
 * `clue` (SPEC §6.5, line errors). Uses only the board, never the solution.
 */
export function lineFeasible(clue: Clue, line: ArrayLike<number>, colors: number): boolean {
  const all = fullMask(colors);
  const masks = Array.from(line, (v) => (v === UNKNOWN ? all : v === MARK_X ? EMPTY_BIT : 1 << v));
  return solveLine(clue, masks) !== null;
}
