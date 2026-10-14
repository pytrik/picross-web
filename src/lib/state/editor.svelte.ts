import { computeClues } from '../puzzle/clues.ts';
import { bitsFor, fromBase64Url, packValues, toBase64Url, unpackValues } from '../puzzle/codec.ts';
import { PALETTES, paletteById } from '../puzzle/palettes.ts';
import { ratePuzzle, type Rating } from '../puzzle/rating.ts';
import { isSingle, solveGrid } from '../puzzle/solver.ts';
import { MARK_X, MAX_COLORS, MAX_SIZE, MIN_SIZE, type PuzzleDef } from '../puzzle/types.ts';
import type { BoardModel } from './board-model.ts';
import { History, type Change } from './history.ts';
import { effectivePalette, loadOverrides, type GridSettings } from './settings.ts';
import { readJson, writeJson, type KV } from './storage.ts';

const SAVE_DEBOUNCE_MS = 300;
const DRAFT_KEY = 'picross:draft';

/** The puzzle a draft's link would contain (SPEC §6.10). */
export interface Export {
  def: PuzzleDef;
  /** Draft color indices (1-based) left out because nothing uses them. */
  dropped: number[];
}

export type EditorStatus =
  | { kind: 'empty' }
  | ({ kind: 'solvable'; rating: Rating } & Export)
  | ({ kind: 'stuck'; undetermined: number[] } & Export);

/**
 * Only the drawn colors, in draft order, with cells renumbered, so a draft
 * that leaves a color out still validates (SPEC §4.1). Null when empty.
 */
export function exportDraft(grid: GridSettings, cells: Uint8Array): Export | null {
  const palette = effectivePalette(grid);
  const used = palette.map((_, i) => cells.includes(i + 1));
  if (!used.some(Boolean)) return null;
  const renumber = new Uint8Array(palette.length + 1);
  let n = 0;
  used.forEach((u, i) => u && (renumber[i + 1] = ++n));
  return {
    def: {
      width: grid.width,
      height: grid.height,
      palette: palette.filter((_, i) => used[i]),
      cells: cells.map((v) => renumber[v]!),
    },
    dropped: used.flatMap((u, i) => (u ? [] : [i + 1])),
  };
}

/** Line-solves the exported puzzle (SPEC §6.10 status). */
export function analyzeDraft(grid: GridSettings, cells: Uint8Array): EditorStatus {
  const exp = exportDraft(grid, cells);
  if (!exp) return { kind: 'empty' };
  const { width, height, palette } = exp.def;
  const { masks, solved } = solveGrid(computeClues(exp.def), width, height, palette.length);
  if (solved) return { kind: 'solvable', rating: ratePuzzle(exp.def), ...exp };
  const undetermined = [...masks.keys()].filter((i) => !isSingle(masks[i]!));
  return { kind: 'stuck', undetermined, ...exp };
}

/**
 * Cells after a grid change: anchored top-left, cells outside the new size
 * or of removed colors erased.
 */
export function reshape(cells: Uint8Array, from: GridSettings, to: GridSettings): Uint8Array {
  const next = new Uint8Array(to.width * to.height);
  for (let r = 0; r < Math.min(from.height, to.height); r++) {
    for (let c = 0; c < Math.min(from.width, to.width); c++) {
      const v = cells[r * from.width + c]!;
      next[r * to.width + c] = v <= to.colors ? v : 0;
    }
  }
  return next;
}

/** Drawn cells a grid change would erase (shown before applying it). */
export function erasedBy(cells: Uint8Array, from: GridSettings, to: GridSettings): number {
  const kept = reshape(cells, from, to).reduce((n, v) => n + (v ? 1 : 0), 0);
  return cells.reduce((n, v) => n + (v ? 1 : 0), 0) - kept;
}

/** Draft grid for an existing puzzle: its preset when the palette matches one. */
export function gridFor(def: PuzzleDef): GridSettings {
  const { width, height, palette } = def;
  const preset = PALETTES.find((p) => palette.every((c, i) => p.colors[i] === c));
  if (preset) return { width, height, colors: palette.length, paletteId: preset.id, overrides: [] };
  const base = PALETTES[0]!;
  const overrides = palette.map((c, i) => (c === base.colors[i] ? null : c));
  return { width, height, colors: palette.length, paletteId: base.id, overrides };
}

/** Just the grid fields (callers may pass whole Settings), with a fresh overrides array. */
export const pickGrid = ({ width, height, colors, paletteId, overrides }: GridSettings): GridSettings => ({
  width,
  height,
  colors,
  paletteId,
  overrides: [...overrides],
});

interface DraftRecord {
  v: 1;
  width: number;
  height: number;
  colors: number;
  paletteId: string;
  overrides: (string | null)[];
  cells: string;
}

const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Stored draft (SPEC §7.4), or null when missing or invalid. */
export function loadDraft(storage: KV | null): { grid: GridSettings; cells: Uint8Array } | null {
  const rec = readJson<Partial<DraftRecord>>(storage, DRAFT_KEY);
  if (!rec || rec.v !== 1 || typeof rec.cells !== 'string') return null;
  const { width, height, colors } = rec;
  if (!inRange(width, MIN_SIZE, MAX_SIZE) || !inRange(height, MIN_SIZE, MAX_SIZE) || !inRange(colors, 1, MAX_COLORS)) {
    return null;
  }
  const grid: GridSettings = {
    width,
    height,
    colors,
    paletteId: paletteById(String(rec.paletteId)).id,
    overrides: loadOverrides(rec.overrides),
  };
  const palette = effectivePalette(grid);
  if (new Set(palette).size !== palette.length) return null;
  try {
    const cells = unpackValues(fromBase64Url(rec.cells), width * height, bitsFor(colors));
    if (cells.some((v) => v > colors)) return null;
    return { grid, cells };
  } catch {
    return null;
  }
}

export function saveDraft(storage: KV | null, grid: GridSettings, cells: Uint8Array): void {
  const rec: DraftRecord = {
    v: 1,
    ...pickGrid(grid),
    cells: toBase64Url(packValues(cells, bitsFor(grid.colors))),
  };
  writeJson(storage, DRAFT_KEY, rec);
}

/** The puzzle editor's draft: cells, undo, live status, saves (SPEC §6.10). */
export class Editor implements BoardModel {
  grid = $state.raw<GridSettings>({ width: 10, height: 10, colors: 1, paletteId: PALETTES[0]!.id, overrides: [] });
  /** Draft cells: 0 empty, 1..N color (never MARK_X). */
  board = $state.raw<Uint8Array>(new Uint8Array(100));
  status = $state.raw<EditorStatus>({ kind: 'empty' });
  /** Undetermined cells shown by Check, until the next change. */
  highlight = $state.raw<ReadonlySet<number>>(new Set());
  canUndo = $state(false);
  canRedo = $state(false);
  readonly solved = false;

  palette = $derived.by(() => effectivePalette(this.grid));
  def = $derived.by(() => ({ width: this.grid.width, height: this.grid.height, palette: this.palette }));
  clues = $derived.by(() => computeClues({ width: this.grid.width, height: this.grid.height, cells: this.board }));
  // No dimming or line errors while drawing.
  rowHints = $derived.by(() => this.clues.rows.map((clue) => clue.map(() => false)));
  colHints = $derived.by(() => this.clues.cols.map((clue) => clue.map(() => false)));
  rowErrors = $derived.by(() => this.clues.rows.map(() => false));
  colErrors = $derived.by(() => this.clues.cols.map(() => false));

  #history = new History();
  #stroke: Map<number, number> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #storage: KV | null;

  /** Loads the stored draft, or starts an empty one with `fallback`'s grid. */
  constructor(storage: KV | null, fallback: GridSettings) {
    this.#storage = storage;
    const saved = loadDraft(storage);
    this.grid = saved?.grid ?? pickGrid(fallback);
    this.board = saved?.cells ?? new Uint8Array(fallback.width * fallback.height);
    this.status = analyzeDraft(this.grid, this.board);
  }

  // --- drawing ---------------------------------------------------------------

  beginStroke(): void {
    this.#stroke = new Map();
  }

  /** Sets one cell inside the current stroke; X means erase. */
  setCell(index: number, value: number): void {
    const v = value === MARK_X ? 0 : value;
    if (!this.#stroke || this.board[index] === v) return;
    if (!this.#stroke.has(index)) this.#stroke.set(index, this.board[index]!);
    const next = this.board.slice();
    next[index] = v;
    this.board = next;
  }

  cancelStroke(): void {
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke || stroke.size === 0) return;
    const next = this.board.slice();
    for (const [index, before] of stroke) next[index] = before;
    this.board = next;
  }

  endStroke(): void {
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
    if (change.cells.length === 0) return;
    this.#history.push(change);
    this.#afterChange();
  }

  /** Empties the grid as one undo step. */
  clear(): void {
    this.beginStroke();
    this.board.forEach((v, i) => v && this.setCell(i, 0));
    this.endStroke();
  }

  undo(): void {
    const change = this.#history.undo();
    if (change) this.#apply(change.cells, change.before);
  }

  redo(): void {
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
    this.status = analyzeDraft(this.grid, this.board);
    this.highlight = new Set();
    this.#scheduleSave();
  }

  // --- grid ------------------------------------------------------------------

  /**
   * Applies a size/colors/palette change. Undo history survives a palette-only
   * change; anything that moves or may erase cells clears it.
   */
  setGrid(next: GridSettings): void {
    const prev = this.grid;
    this.grid = pickGrid(next);
    if (next.width !== prev.width || next.height !== prev.height || next.colors < prev.colors) {
      this.board = reshape(this.board, prev, next);
      this.#history.clear();
    }
    this.#afterChange();
  }

  /** Replaces the draft with an existing puzzle (Copy puzzle, SPEC §6.10). */
  copyFrom(def: PuzzleDef): void {
    this.grid = gridFor(def);
    this.board = def.cells.slice();
    this.#history.clear();
    this.#afterChange();
  }

  /** Check: highlights the undetermined cells until the next change. */
  check(): EditorStatus {
    this.highlight = new Set(this.status.kind === 'stuck' ? this.status.undetermined : []);
    return this.status;
  }

  // --- persistence (SPEC §7.4) -----------------------------------------------

  #scheduleSave(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    saveDraft(this.#storage, this.grid, this.board);
  }
}
