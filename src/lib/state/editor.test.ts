import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePuzzle, encodePuzzle } from '../puzzle/codec.ts';
import { PALETTES } from '../puzzle/palettes.ts';
import { MARK_X, type PuzzleDef } from '../puzzle/types.ts';
import { analyzeDraft, Editor, erasedBy, exportDraft, gridFor, loadDraft, reshape } from './editor.svelte.ts';
import type { GridSettings } from './settings.ts';
import type { KV } from './storage.ts';

function memoryStorage(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const grid = (over: Partial<GridSettings> = {}): GridSettings => ({
  width: 5,
  height: 5,
  colors: 2,
  paletteId: 'classic',
  overrides: [],
  ...over,
});

/** Rows of `.` (empty) and digits (color index). */
const cellsOf = (rows: string[]) => Uint8Array.from(rows.join(''), (ch) => (ch === '.' ? 0 : Number(ch)));

// Top row and left column filled: every line is forced, so line-solvable.
const ELL = ['11111', '1....', '1....', '1....', '1....'];
// Two diagonal cells: rows [1],[1] and columns [1],[1] fit either diagonal.
const DIAG = ['1....', '.1...', '.....', '.....', '.....'];

function newEditor(storage: KV = memoryStorage(), g = grid()) {
  return new Editor(storage, g);
}

function draw(editor: Editor, cells: [number, number][]) {
  editor.beginStroke();
  for (const [i, v] of cells) editor.setCell(i, v);
  editor.endStroke();
}

test('a new draft takes the fallback grid and is empty', () => {
  const editor = newEditor(memoryStorage(), grid({ width: 7, height: 6 }));
  assert.equal(editor.board.length, 42);
  assert.deepEqual(editor.def, { width: 7, height: 6, palette: PALETTES[0]!.colors.slice(0, 2) });
  assert.equal(editor.status.kind, 'empty');
});

test('strokes are undo steps; X erases; clues follow the cells', () => {
  const editor = newEditor();
  draw(editor, [[0, 1], [1, 1], [2, 2]]);
  assert.deepEqual(editor.clues.rows[0], [{ len: 2, color: 1 }, { len: 1, color: 2 }]);
  draw(editor, [[1, MARK_X]]);
  assert.equal(editor.board[1], 0, 'X means erase');
  editor.undo();
  assert.equal(editor.board[1], 1);
  editor.undo();
  assert.ok(editor.board.every((v) => v === 0));
  assert.ok(!editor.canUndo && editor.canRedo);
  editor.redo();
  assert.deepEqual([...editor.board.slice(0, 3)], [1, 1, 2]);
});

test('a cancelled stroke reverts without an undo step', () => {
  const editor = newEditor();
  editor.beginStroke();
  editor.setCell(0, 1);
  editor.cancelStroke();
  assert.equal(editor.board[0], 0);
  assert.ok(!editor.canUndo);
});

test('Clear empties the grid as one undo step', () => {
  const editor = newEditor();
  draw(editor, [[0, 1], [6, 2]]);
  editor.clear();
  assert.ok(editor.board.every((v) => v === 0));
  editor.undo();
  assert.equal(editor.board[0], 1);
  assert.equal(editor.board[6], 2);
});

test('status: empty, line-solvable with rating, or undetermined cells', () => {
  assert.equal(analyzeDraft(grid({ colors: 1 }), new Uint8Array(25)).kind, 'empty');
  const ok = analyzeDraft(grid({ colors: 1 }), cellsOf(ELL));
  assert.equal(ok.kind, 'solvable');
  assert.equal(ok.kind === 'solvable' && ok.rating, 'easy');
  const stuck = analyzeDraft(grid({ colors: 1 }), cellsOf(DIAG));
  assert.equal(stuck.kind, 'stuck');
  assert.deepEqual(stuck.kind === 'stuck' && stuck.undetermined, [0, 1, 5, 6]);
});

test('Check highlights undetermined cells until the next change', () => {
  const editor = newEditor();
  draw(editor, [[0, 1], [6, 1]]);
  assert.equal(editor.highlight.size, 0, 'nothing shown before Check');
  assert.equal(editor.check().kind, 'stuck');
  assert.deepEqual([...editor.highlight], [0, 1, 5, 6]);
  draw(editor, [[24, 1]]);
  assert.equal(editor.highlight.size, 0);
});

test('export keeps only drawn colors, renumbered in draft order', () => {
  const g = grid({ colors: 3 });
  const cells = cellsOf(['3....', '.....', '.....', '.....', '....1']);
  const exp = exportDraft(g, cells)!;
  const classic = PALETTES[0]!.colors;
  assert.deepEqual(exp.def.palette, [classic[0], classic[2]]);
  assert.deepEqual(exp.dropped, [2]);
  assert.equal(exp.def.cells[0], 2);
  assert.equal(exp.def.cells[24], 1);
  // The export is a valid definition.
  assert.deepEqual(decodePuzzle(encodePuzzle(exp.def).slice(2)), exp.def);
  assert.equal(exportDraft(g, new Uint8Array(25)), null);
});

test('reshape anchors top-left and drops removed colors; erasedBy counts it', () => {
  const from = grid({ colors: 3 });
  const cells = cellsOf(['1...3', '.....', '..2..', '.....', '1...1']);
  const to = grid({ width: 6, height: 4, colors: 2 });
  const next = reshape(cells, from, to);
  assert.equal(next.length, 24);
  assert.equal(next[0], 1);
  assert.equal(next[4], 0, 'color 3 removed');
  assert.equal(next[2 * 6 + 2], 2);
  assert.equal(erasedBy(cells, from, to), 3, 'color 3 and the bottom row');
  assert.equal(erasedBy(cells, from, from), 0);
});

test('setGrid keeps history for palette changes, clears it when cells may move', () => {
  const editor = newEditor();
  draw(editor, [[0, 1]]);
  editor.setGrid(grid({ paletteId: 'pastel' }));
  assert.equal(editor.palette[0], PALETTES[1]!.colors[0]);
  assert.ok(editor.canUndo);
  editor.setGrid(grid({ paletteId: 'pastel', colors: 3 }));
  assert.ok(editor.canUndo, 'more colors erase nothing');
  editor.setGrid(grid({ width: 6 }));
  assert.ok(!editor.canUndo);
  assert.equal(editor.board.length, 30);
  assert.equal(editor.board[0], 1);
});

test('gridFor uses a matching preset, else Classic with overrides', () => {
  const cells = cellsOf(ELL);
  const pastel = PALETTES[1]!.colors.slice(0, 1);
  assert.deepEqual(gridFor({ width: 5, height: 5, palette: pastel, cells }), grid({ colors: 1, paletteId: 'pastel' }));
  const def: PuzzleDef = { width: 5, height: 5, palette: [PALETTES[0]!.colors[0]!, '#123456'], cells };
  assert.deepEqual(gridFor(def), grid({ overrides: [null, '#123456'] }));
});

test('copyFrom replaces the draft and clears history', () => {
  const editor = newEditor();
  draw(editor, [[0, 1]]);
  const cells = cellsOf(['22...', '.....', '..1..', '.....', '.....']);
  editor.copyFrom({ width: 5, height: 5, palette: PALETTES[0]!.colors.slice(0, 2), cells });
  assert.deepEqual([...editor.board], [...cells]);
  assert.ok(!editor.canUndo);
});

test('the draft persists and reloads; invalid records start fresh', () => {
  const storage = memoryStorage();
  const editor = newEditor(storage, grid({ colors: 3, overrides: [null, '#123456'] }));
  draw(editor, [[0, 3], [7, 2]]);
  editor.flush();
  const again = newEditor(storage, grid({ width: 9 }));
  assert.deepEqual(again.grid, grid({ colors: 3, overrides: [null, '#123456'] }));
  assert.deepEqual([...again.board], [...editor.board]);

  const bad = (rec: object) => {
    storage.setItem('picross:draft', JSON.stringify({ ...JSON.parse(storage.map.get('picross:draft')!), ...rec }));
    return loadDraft(storage);
  };
  assert.ok(bad({}));
  assert.equal(bad({ v: 2 }), null);
  assert.equal(bad({ width: 31 }), null);
  assert.equal(bad({ colors: 1 }), null, 'cells use colors above the count (and bit width differs)');
  assert.equal(bad({ cells: 'AAAA' }), null, 'wrong length');
  assert.equal(bad({ overrides: ['#d94040'] }), null, 'duplicate colors');
  storage.setItem('picross:draft', 'not json');
  assert.equal(newEditor(storage).status.kind, 'empty');
});
