import { MARK_X, UNKNOWN, type Clue, type Clues, type PuzzleDef } from './types.ts';

/** Indices of the cells in row `r` / column `c` of a width×height grid. */
export function rowIndices(width: number, r: number): number[] {
  return Array.from({ length: width }, (_, c) => r * width + c);
}

export function colIndices(width: number, height: number, c: number): number[] {
  return Array.from({ length: height }, (_, r) => r * width + c);
}

/** Runs of a line of solution values (0 = empty). */
export function lineClue(values: ArrayLike<number>): Clue {
  const runs: Clue = [];
  for (let i = 0; i < values.length; ) {
    const color = values[i]!;
    let j = i + 1;
    while (j < values.length && values[j] === color) j++;
    if (color !== 0) runs.push({ len: j - i, color });
    i = j;
  }
  return runs;
}

const pick = (cells: ArrayLike<number>, idx: number[]) => idx.map((i) => cells[i]!);

export function computeClues(def: Pick<PuzzleDef, 'width' | 'height' | 'cells'>): Clues {
  const { width, height, cells } = def;
  return {
    rows: Array.from({ length: height }, (_, r) => lineClue(pick(cells, rowIndices(width, r)))),
    cols: Array.from({ length: width }, (_, c) => lineClue(pick(cells, colIndices(width, height, c)))),
  };
}

export function sameClue(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((run, i) => run.len === b[i]!.len && run.color === b[i]!.color);
}

/** Board line → solution-like line (unknown and X both count as empty). */
const filledOnly = (line: ArrayLike<number>) =>
  Array.from(line, (v) => (v === MARK_X ? 0 : v));

/** True when the board's filled cells satisfy every row and column clue. */
export function boardSatisfies(clues: Clues, width: number, height: number, board: Uint8Array): boolean {
  for (let r = 0; r < height; r++) {
    if (!sameClue(lineClue(filledOnly(pick(board, rowIndices(width, r)))), clues.rows[r]!)) return false;
  }
  for (let c = 0; c < width; c++) {
    if (!sameClue(lineClue(filledOnly(pick(board, colIndices(width, height, c)))), clues.cols[c]!)) {
      return false;
    }
  }
  return true;
}

/**
 * Which clue runs to dim for one board line (SPEC §6.5). Uses only the board,
 * never the solution. Whole clue dims when the filled cells match it exactly;
 * otherwise runs provably placed from either end (bounded by edge/X/other
 * color, scanning until the first unknown cell) are dimmed individually.
 */
export function completedRuns(clue: Clue, line: ArrayLike<number>): boolean[] {
  const done = clue.map(() => false);
  if (sameClue(lineClue(filledOnly(line)), clue)) return done.map(() => true);

  const n = line.length;
  const scan = (from: number, step: 1 | -1, order: number[]): number => {
    let pos = from;
    let k = 0;
    while (k < order.length) {
      while (pos >= 0 && pos < n && line[pos] === MARK_X) pos += step;
      if (pos < 0 || pos >= n || line[pos] === UNKNOWN) break;
      const color = line[pos]!;
      let end = pos;
      while (end + step >= 0 && end + step < n && line[end + step] === color) end += step;
      const next = end + step;
      if (next >= 0 && next < n && line[next] === UNKNOWN) break; // run may still grow
      const run = clue[order[k]!]!;
      if (run.color !== color || run.len !== Math.abs(end - pos) + 1) break;
      done[order[k]!] = true;
      k++;
      pos = next;
    }
    return k;
  };

  const fromLeft = scan(0, 1, clue.map((_, i) => i));
  const rest = clue.map((_, i) => clue.length - 1 - i).slice(0, clue.length - fromLeft);
  scan(n - 1, -1, rest);
  return done;
}
