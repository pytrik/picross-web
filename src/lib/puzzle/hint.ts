import { colIndices, rowIndices } from './clues.ts';
import { EMPTY_BIT, fullMask, isSingle, solveLine } from './solver.ts';
import { MARK_X, UNKNOWN, type Clues, type PuzzleDef } from './types.ts';

/** A row or column. */
export interface LineRef {
  axis: 'row' | 'col';
  index: number;
}

export type Hint =
  /** The board contradicts the solution; nothing is deduced from it. */
  | { kind: 'wrong'; cells: number[] }
  /** Line logic can't determine any further cell. */
  | { kind: 'stuck' }
  /** `line` forces `cell` to `value` (color index or MARK_X). */
  | { kind: 'cell'; cell: number; value: number; line: LineRef };

/** Board cells that contradict the solution (SPEC §6.5, mistake check). */
export function wrongCells(def: PuzzleDef, board: ArrayLike<number>): number[] {
  const wrong: number[] = [];
  for (let i = 0; i < def.cells.length; i++) {
    const v = board[i]!;
    if (v === UNKNOWN) continue;
    if (v === MARK_X ? def.cells[i] !== 0 : def.cells[i] !== v) wrong.push(i);
  }
  return wrong;
}

/**
 * Next hint (SPEC §6.9): among the lines that force at least one unknown cell
 * from the current marks, the one forcing the most; ties go to the line
 * nearest `cursor`, and within it the forced cell nearest `cursor`.
 *
 * With several colors, line logic also learns partial facts ("not red") that
 * the board can't show, so marks alone may force nothing even though the
 * puzzle is line-solvable. Then those partial facts are propagated one round
 * at a time (every line against the same knowledge) until a line forces a
 * cell.
 */
export function findHint(def: PuzzleDef, clues: Clues, board: ArrayLike<number>, cursor = 0): Hint {
  const wrong = wrongCells(def, board);
  if (wrong.length) return { kind: 'wrong', cells: wrong };

  const { width, height } = def;
  const all = fullMask(def.palette.length);
  const curRow = Math.floor(cursor / width);
  const curCol = cursor % width;
  const lines: (LineRef & { indices: number[] })[] = [
    ...Array.from({ length: height }, (_, r) => ({ axis: 'row' as const, index: r, indices: rowIndices(width, r) })),
    ...Array.from({ length: width }, (_, c) => ({ axis: 'col' as const, index: c, indices: colIndices(width, height, c) })),
  ];
  const knowledge = Uint8Array.from(board as ArrayLike<number>, (v) => (v === UNKNOWN ? all : v === MARK_X ? EMPTY_BIT : 1 << v));

  type Best = { line: LineRef; forced: { cell: number; value: number }[]; dist: number };
  let best: Best | null = null;
  while (!best) {
    const next = knowledge.slice();
    for (const { axis, index, indices } of lines) {
      const clue = axis === 'row' ? clues.rows[index]! : clues.cols[index]!;
      // Every mark is correct, so the solution's placement always fits.
      const possible = solveLine(clue, indices.map((i) => knowledge[i]!));
      if (!possible) continue;
      const forced: { cell: number; value: number }[] = [];
      indices.forEach((cell, p) => {
        const m = knowledge[cell]! & possible[p]!;
        next[cell] = next[cell]! & m;
        if (board[cell] === UNKNOWN && isSingle(m)) forced.push({ cell, value: m === EMPTY_BIT ? MARK_X : Math.log2(m) });
      });
      if (!forced.length) continue;
      const dist = Math.abs(index - (axis === 'row' ? curRow : curCol));
      if (!best || forced.length > best.forced.length || (forced.length === best.forced.length && dist < best.dist)) {
        best = { line: { axis, index }, forced, dist };
      }
    }
    if (best) break;
    if (next.every((m, i) => m === knowledge[i])) return { kind: 'stuck' };
    knowledge.set(next);
  }

  const { line, forced } = best;
  const along = (cell: number) => (line.axis === 'row' ? Math.abs((cell % width) - curCol) : Math.abs(Math.floor(cell / width) - curRow));
  const pick = forced.reduce((a, b) => (along(b.cell) < along(a.cell) ? b : a));
  return { kind: 'cell', cell: pick.cell, value: pick.value, line };
}
