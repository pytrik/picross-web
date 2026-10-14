import { colIndices, computeClues, rowIndices } from './clues.ts';
import { fullMask, isSingle, solveLine } from './solver.ts';
import type { Clue, PuzzleDef } from './types.ts';

/** SPEC §5.5. */
export type Rating = 'easy' | 'medium' | 'hard' | 'unrated';
export type Difficulty = 'easy' | 'medium' | 'hard';
/** New puzzle target: a difficulty, or 'any' (density from the slider). */
export type Target = Difficulty | 'any';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Smallest area (W×H) at which a difficulty can be reached and shown. */
export const MIN_AREA: Record<Difficulty, number> = { easy: 0, medium: 75, hard: 150 };

/** Effort thresholds on rounds / (W + H): below MEDIUM is easy, etc. */
export const MEDIUM_EFFORT = 0.2;
export const HARD_EFFORT = 0.3;

/** Density band the generator draws from per target difficulty. */
export const DENSITY_BANDS: Record<Difficulty, readonly [number, number]> = {
  easy: [0.68, 0.75],
  medium: [0.52, 0.62],
  hard: [0.4, 0.48],
};

export const RATING_LABELS: Record<Rating, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  unrated: 'Unrated',
};

/** Whether a puzzle of this size can be generated at (and rated) `level`. */
export const difficultyAllowed = (level: Difficulty, width: number, height: number) => width * height >= MIN_AREA[level];

/**
 * Line-solver rounds from an empty board until every cell is determined, or
 * null if line logic gets stuck. One round solves every line against the
 * same knowledge (all lines in parallel), so it measures how long the chain
 * of deductions is, independent of line order.
 */
export function solveRounds(def: PuzzleDef): number | null {
  const { width, height } = def;
  const clues = computeClues(def);
  const lines: [Clue, number[]][] = [
    ...Array.from({ length: height }, (_, r): [Clue, number[]] => [clues.rows[r]!, rowIndices(width, r)]),
    ...Array.from({ length: width }, (_, c): [Clue, number[]] => [clues.cols[c]!, colIndices(width, height, c)]),
  ];
  const masks = new Uint8Array(width * height).fill(fullMask(def.palette.length));
  // A line only needs solving again if one of its cells changed.
  let dirty = new Uint8Array(lines.length).fill(1);
  let rounds = 0;
  for (;;) {
    const next = masks.slice();
    const nextDirty = new Uint8Array(lines.length);
    let changed = false;
    lines.forEach(([clue, indices], li) => {
      if (!dirty[li]) return;
      const possible = solveLine(clue, indices.map((i) => masks[i]!));
      if (!possible) throw new Error('Inconsistent clues');
      indices.forEach((cell, p) => {
        const m = next[cell]! & possible[p]!;
        if (m === next[cell]) return;
        next[cell] = m;
        changed = true;
        nextDirty[Math.floor(cell / width)] = 1;
        nextDirty[height + (cell % width)] = 1;
      });
    });
    if (!changed) break;
    rounds++;
    masks.set(next);
    dirty = nextDirty;
  }
  return masks.every(isSingle) ? rounds : null;
}

/**
 * Difficulty of a puzzle (SPEC §5.5): solver effort rounds / (W + H),
 * capped by area so small boards never rate above what can be generated.
 */
export function ratePuzzle(def: PuzzleDef): Rating {
  const rounds = solveRounds(def);
  if (rounds === null) return 'unrated';
  const effort = rounds / (def.width + def.height);
  const level: Difficulty = effort >= HARD_EFFORT ? 'hard' : effort >= MEDIUM_EFFORT ? 'medium' : 'easy';
  for (let i = DIFFICULTIES.indexOf(level); i > 0; i--) {
    if (difficultyAllowed(DIFFICULTIES[i]!, def.width, def.height)) return DIFFICULTIES[i]!;
  }
  return 'easy';
}
