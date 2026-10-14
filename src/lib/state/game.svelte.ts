import { boardSatisfies, colIndices, completedRuns, computeClues, lineClue, rowIndices, sameClue } from '../puzzle/clues.ts';
import { lineFeasible } from '../puzzle/solver.ts';
import { MARK_X, UNKNOWN, type Clues, type PuzzleDef } from '../puzzle/types.ts';
import type { LoadedPuzzle } from '../source/index.ts';
import { History, type Change } from './history.ts';
import { clearProgress, loadProgress, saveProgress } from './progress.ts';
import type { KV } from './storage.ts';

const SAVE_DEBOUNCE_MS = 300;

/**
 * Click result per SPEC §6.2: what a cell becomes when `tool` is applied to
 * it. `tool` is a color index (fill) or MARK_X.
 */
export function clickTarget(current: number, tool: number): number {
  if (tool === MARK_X) return current === MARK_X ? UNKNOWN : MARK_X;
  return current === tool ? UNKNOWN : tool;
}

/** One puzzle being played: board, timer, undo history, persistence. */
export class Game {
  readonly def: PuzzleDef;
  readonly hash: string;
  readonly key: string;
  readonly clues: Clues;
  readonly colors: number;

  board = $state.raw<Uint8Array>(new Uint8Array());
  checks = $state(0);
  solved = $state(false);
  canUndo = $state(false);
  canRedo = $state(false);
  /** Auto-X finished lines after each stroke (SPEC §6.5). */
  autoX = false;

  /** Persisted elapsed time, excluding the currently running stretch. */
  #elapsedBase = $state(0);
  #runningSince = $state<number | null>(null);
  /** Updated by tick() so elapsed time re-renders. */
  #now = $state(performance.now());

  #history = new History();
  #stroke: Map<number, number> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #storage: KV | null;
  #onSolved: () => void;

  /** Clue runs to dim, per line (SPEC §6.5). Arrows defer `this.clues`. */
  rowHints = $derived.by(() =>
    this.clues.rows.map((clue, r) => completedRuns(clue, this.#line(rowIndices(this.def.width, r)))),
  );
  colHints = $derived.by(() =>
    this.clues.cols.map((clue, c) => completedRuns(clue, this.#line(colIndices(this.def.width, this.def.height, c)))),
  );

  /** Lines whose marks can no longer fit their clue (SPEC §6.5). */
  rowErrors = $derived.by(() =>
    this.clues.rows.map((clue, r) => !lineFeasible(clue, this.#line(rowIndices(this.def.width, r)), this.colors)),
  );
  colErrors = $derived.by(() =>
    this.clues.cols.map(
      (clue, c) => !lineFeasible(clue, this.#line(colIndices(this.def.width, this.def.height, c)), this.colors),
    ),
  );

  constructor(puzzle: LoadedPuzzle, storage: KV | null, onSolved: () => void) {
    this.def = puzzle.def;
    this.hash = puzzle.hash;
    this.key = puzzle.key;
    this.clues = computeClues(puzzle.def);
    this.colors = puzzle.def.palette.length;
    this.#storage = storage;
    this.#onSolved = onSolved;

    const saved = loadProgress(storage, this.key, this.colors, puzzle.def.cells.length);
    this.board = saved?.board ?? new Uint8Array(puzzle.def.cells.length);
    this.#elapsedBase = saved?.elapsedMs ?? 0;
    this.checks = saved?.checks ?? 0;
    this.solved = saved?.solved ?? false;
  }

  #line(indices: number[]): number[] {
    return indices.map((i) => this.board[i]!);
  }

  // --- timer (SPEC §6.5) -----------------------------------------------------

  get elapsedMs(): number {
    return this.#elapsedBase + (this.#runningSince === null ? 0 : Math.max(0, this.#now - this.#runningSince));
  }

  get started(): boolean {
    return this.#elapsedBase > 0 || this.#runningSince !== null || this.board.some((v) => v !== UNKNOWN);
  }

  tick(): void {
    this.#now = performance.now();
  }

  /** Starts/continues the clock, if the puzzle is in progress. */
  resume(): void {
    if (this.solved || !this.started || this.#runningSince !== null) return;
    this.#runningSince = this.#now = performance.now();
  }

  pause(): void {
    if (this.#runningSince === null) return;
    this.#elapsedBase += performance.now() - this.#runningSince;
    this.#runningSince = null;
  }

  // --- editing ---------------------------------------------------------------

  beginStroke(): void {
    if (!this.solved) this.#stroke = new Map();
  }

  /** Sets one cell inside the current stroke (no-op outside a stroke). */
  setCell(index: number, value: number): void {
    if (!this.#stroke || this.board[index] === value) return;
    if (!this.#stroke.has(index)) this.#stroke.set(index, this.board[index]!);
    const next = this.board.slice();
    next[index] = value;
    this.board = next;
    // Start the clock on the first change.
    if (this.#runningSince === null) {
      this.#runningSince = this.#now = performance.now();
    }
  }

  /** Reverts the current stroke without an undo step (SPEC §6.3). */
  cancelStroke(): void {
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke || stroke.size === 0) return;
    const next = this.board.slice();
    for (const [index, before] of stroke) next[index] = before;
    this.board = next;
    this.#scheduleSave();
  }

  endStroke(): void {
    if (this.autoX && this.#stroke) this.#autoX(this.#stroke);
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke) return;
    const change: Change = { cells: [], before: [], after: [] };
    for (const [index, before] of stroke) {
      if (this.board[index] === before) continue;
      change.cells.push(index);
      change.before.push(before);
      change.after.push(this.board[index]!);
    }
    this.#history.push(change);
    this.#afterChange();
  }

  /**
   * Marks X on the unknown cells of every line the stroke changed whose fills
   * now match its clue. Runs inside the stroke, so it shares its undo step.
   */
  #autoX(stroke: Map<number, number>): void {
    const { width, height } = this.def;
    const rows = new Set<number>();
    const cols = new Set<number>();
    for (const [index, before] of stroke) {
      if (this.board[index] === before) continue;
      rows.add(Math.floor(index / width));
      cols.add(index % width);
    }
    const lines = [
      ...[...rows].map((r) => [this.clues.rows[r]!, rowIndices(width, r)] as const),
      ...[...cols].map((c) => [this.clues.cols[c]!, colIndices(width, height, c)] as const),
    ];
    for (const [clue, indices] of lines) {
      const fills = indices.map((i) => (this.board[i] === MARK_X ? 0 : this.board[i]!));
      if (!sameClue(lineClue(fills), clue)) continue;
      for (const i of indices) if (this.board[i] === UNKNOWN) this.setCell(i, MARK_X);
    }
  }

  undo(): void {
    if (this.solved) return;
    const change = this.#history.undo();
    if (change) this.#apply(change.cells, change.before);
  }

  redo(): void {
    if (this.solved) return;
    const change = this.#history.redo();
    if (change) this.#apply(change.cells, change.after);
  }

  #apply(cells: number[], values: number[]): void {
    const next = this.board.slice();
    cells.forEach((cell, i) => (next[cell] = values[i]!));
    this.board = next;
    this.#afterChange();
  }

  #afterChange(): void {
    this.canUndo = this.#history.canUndo;
    this.canRedo = this.#history.canRedo;
    if (boardSatisfies(this.clues, this.def.width, this.def.height, this.board)) {
      this.pause();
      this.solved = true;
      this.flush();
      this.#onSolved();
    } else {
      this.#scheduleSave();
    }
  }

  // --- assists ---------------------------------------------------------------

  /** Cells contradicting the solution (SPEC §6.5). Counts as a check. */
  check(): number[] {
    this.checks++;
    const wrong: number[] = [];
    const sol = this.def.cells;
    this.board.forEach((v, i) => {
      if (v === UNKNOWN) return;
      if (v === MARK_X ? sol[i] !== 0 : sol[i] !== v) wrong.push(i);
    });
    this.#scheduleSave();
    return wrong;
  }

  restart(): void {
    this.board = new Uint8Array(this.def.cells.length);
    this.#elapsedBase = 0;
    this.#runningSince = null;
    this.checks = 0;
    this.solved = false;
    this.#history.clear();
    this.canUndo = this.canRedo = false;
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    clearProgress(this.#storage, this.key);
  }

  // --- persistence (SPEC §7) -------------------------------------------------

  #scheduleSave(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    this.tick();
    saveProgress(this.#storage, this.key, this.colors, {
      board: this.board,
      elapsedMs: this.elapsedMs,
      checks: this.checks,
      solved: this.solved,
      hash: this.hash,
    });
  }
}
