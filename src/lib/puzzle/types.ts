/** Immutable puzzle definition (SPEC §4.1). */
export interface PuzzleDef {
  width: number;
  height: number;
  /** 1..6 lowercase `#rrggbb` colors; grid value `i` is `palette[i - 1]`. */
  palette: string[];
  /** width*height, row-major; 0 = empty, 1..N = palette color. */
  cells: Uint8Array;
  /** Reserved for database puzzles (SPEC §11). */
  id?: string;
  title?: string;
}

/** A run of consecutive same-colored cells in a line. */
export interface Run {
  len: number;
  color: number;
}

export type Clue = Run[];

export interface Clues {
  rows: Clue[];
  cols: Clue[];
}

/**
 * Board cell values: 0 = unknown, 1..N = filled with that color, MARK_X =
 * marked empty. Kept in a Uint8Array.
 */
export const UNKNOWN = 0;
export const MARK_X = 255;

export const MIN_SIZE = 5;
export const MAX_SIZE = 30;
export const MAX_COLORS = 6;

export class PuzzleError extends Error {}
