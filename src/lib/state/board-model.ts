import type { Clues, PuzzleDef } from '../puzzle/types.ts';

/**
 * What Board.svelte reads from and writes to: a Game (play) or an Editor
 * (SPEC §6.10). Values in `board` are 0 unknown/empty, 1..N color, MARK_X.
 */
export interface BoardModel {
  readonly def: Pick<PuzzleDef, 'width' | 'height' | 'palette'>;
  readonly clues: Clues;
  readonly board: Uint8Array;
  readonly solved: boolean;
  /** Clue runs to dim, per line (SPEC §6.5). */
  readonly rowHints: boolean[][];
  readonly colHints: boolean[][];
  /** Lines whose marks can no longer fit their clue (SPEC §6.5). */
  readonly rowErrors: boolean[];
  readonly colErrors: boolean[];
  beginStroke(): void;
  setCell(index: number, value: number): void;
  cancelStroke(): void;
  endStroke(): void;
}
