import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fromDefinition } from '../source/index.ts';
import { MARK_X, type PuzzleDef } from '../puzzle/types.ts';
import { clickTarget, Game } from './game.svelte.ts';
import { loadProgress, saveProgress } from './progress.ts';
import type { KV } from './storage.ts';

// 5x5, 2 colors. Row 0 = 2×color1 then 3 empty, everything else per grid.
function puzzle(): PuzzleDef {
  const rows = ['11...', '.....', '..2..', '.....', '1...2'];
  const cells = new Uint8Array(25);
  rows.forEach((row, r) => [...row].forEach((ch, c) => (cells[r * 5 + c] = ch === '.' ? 0 : Number(ch))));
  return { width: 5, height: 5, palette: ['#222222', '#d94040'], cells };
}

function memoryStorage(): KV {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

// Controllable clock for the timer.
let now = 0;
const realNow = performance.now.bind(performance);
beforeEach(() => {
  now = 1000;
  performance.now = () => now;
});
afterEach(() => {
  performance.now = realNow;
});

function newGame(storage = memoryStorage(), onSolved = () => {}) {
  return { game: new Game(fromDefinition(puzzle()), storage, onSolved), storage };
}

function stroke(game: Game, cells: [number, number][]) {
  game.beginStroke();
  for (const [i, v] of cells) game.setCell(i, v);
  game.endStroke();
}

test('clickTarget follows SPEC §6.2', () => {
  assert.equal(clickTarget(0, 1), 1);
  assert.equal(clickTarget(1, 1), 0);
  assert.equal(clickTarget(2, 1), 1);
  assert.equal(clickTarget(MARK_X, 1), 1);
  assert.equal(clickTarget(0, MARK_X), MARK_X);
  assert.equal(clickTarget(2, MARK_X), MARK_X);
  assert.equal(clickTarget(MARK_X, MARK_X), 0);
});

test('a stroke is one undo step; undo/redo restore values', () => {
  const { game } = newGame();
  stroke(game, [[0, 1], [1, 1], [2, MARK_X]]);
  assert.deepEqual([...game.board.slice(0, 3)], [1, 1, MARK_X]);
  assert.ok(game.canUndo && !game.canRedo);
  game.undo();
  assert.deepEqual([...game.board.slice(0, 3)], [0, 0, 0]);
  assert.ok(!game.canUndo && game.canRedo);
  game.redo();
  assert.deepEqual([...game.board.slice(0, 3)], [1, 1, MARK_X]);
});

test('setCell outside a stroke is ignored', () => {
  const { game } = newGame();
  game.setCell(0, 1);
  assert.equal(game.board[0], 0);
});

test('clue hints update with the board', () => {
  const { game } = newGame();
  assert.deepEqual(game.rowHints[0], [false]);
  stroke(game, [[0, 1], [1, 1], [2, MARK_X]]);
  assert.deepEqual(game.rowHints[0], [true]);
});

test('timer starts on the first change, pauses and resumes', () => {
  const { game } = newGame();
  game.resume(); // nothing marked yet: must not start
  now += 5000;
  game.tick();
  assert.equal(game.elapsedMs, 0);

  stroke(game, [[0, 1]]);
  now += 3000;
  game.tick();
  assert.equal(game.elapsedMs, 3000);

  game.pause();
  now += 10_000;
  game.tick();
  assert.equal(game.elapsedMs, 3000);

  game.resume();
  now += 1000;
  game.tick();
  assert.equal(game.elapsedMs, 4000);
});

test('loading a puzzle with marks resumes the timer immediately (SPEC §6.5)', () => {
  const storage = memoryStorage();
  const { game } = newGame(storage);
  stroke(game, [[3, MARK_X]]);
  now += 2000;
  game.pause();
  game.flush();

  const { game: reopened } = newGame(storage);
  assert.equal(reopened.elapsedMs, 2000);
  reopened.resume();
  now += 1500;
  reopened.tick();
  assert.equal(reopened.elapsedMs, 3500);
});

test('solving stops the timer, persists, locks the board and calls onSolved', () => {
  let solvedCalls = 0;
  const { game, storage } = newGame(memoryStorage(), () => solvedCalls++);
  stroke(game, [[0, 1], [1, 1], [12, 2], [20, 1]]);
  assert.equal(game.solved, false);
  now += 1000;
  stroke(game, [[24, 2]]);
  assert.equal(game.solved, true);
  assert.equal(solvedCalls, 1);

  const elapsed = game.elapsedMs;
  now += 60_000;
  game.tick();
  assert.equal(game.elapsedMs, elapsed, 'clock stopped');

  stroke(game, [[5, 1]]);
  assert.equal(game.board[5], 0, 'board is read-only');
  game.undo();
  assert.equal(game.board[24], 2, 'undo disabled');

  const saved = loadProgress(storage, game.key, 2, 25);
  assert.equal(saved?.solved, true);
});

test('check counts presses and reports wrong cells only', () => {
  const { game } = newGame();
  stroke(game, [[0, 1], [1, 2], [2, 1], [5, MARK_X], [12, MARK_X]]);
  // 1 = wrong color, 2 = filled where empty, 12 = X where filled; 0 and 5 right.
  assert.deepEqual(game.check().sort((a, b) => a - b), [1, 2, 12]);
  assert.equal(game.checks, 1);
});

test('restart clears board, timer, checks and stored progress', () => {
  const { game, storage } = newGame();
  stroke(game, [[0, 1]]);
  game.check();
  now += 4000;
  game.flush();
  assert.ok(loadProgress(storage, game.key, 2, 25));

  game.restart();
  assert.ok(game.board.every((v) => v === 0));
  assert.equal(game.elapsedMs, 0);
  assert.equal(game.checks, 0);
  assert.ok(!game.canUndo);
  assert.equal(loadProgress(storage, game.key, 2, 25), null);
});

test('progress saved elsewhere is loaded on construction', () => {
  const storage = memoryStorage();
  const loaded = fromDefinition(puzzle());
  const board = new Uint8Array(25);
  board[0] = 1;
  board[1] = MARK_X;
  saveProgress(storage, loaded.key, 2, { board, elapsedMs: 777, checks: 3, solved: false });
  const game = new Game(loaded, storage, () => {});
  assert.deepEqual([...game.board.slice(0, 2)], [1, MARK_X]);
  assert.equal(game.elapsedMs, 777);
  assert.equal(game.checks, 3);
});

test('line errors flag only lines whose marks cannot fit (SPEC §6.5)', () => {
  const { game } = newGame();
  assert.ok(!game.rowErrors.some(Boolean) && !game.colErrors.some(Boolean));
  stroke(game, [[2, 1]]);
  assert.ok(!game.rowErrors[0], 'row 0 can still hold a 2-run over cell 2');
  assert.ok(game.colErrors[2], 'column 2 only has a color-2 run');
  stroke(game, [[0, 1], [1, 1]]);
  assert.ok(game.rowErrors[0], 'three filled cells for a 2-run');
  assert.deepEqual(game.rowErrors.slice(1), [false, false, false, false]);
});

test('auto-X marks finished lines inside the same undo step (SPEC §6.5)', () => {
  const { game } = newGame();
  stroke(game, [[0, 1], [1, 1]]);
  assert.ok(!game.board.includes(MARK_X), 'off by default');
  game.undo();

  game.autoX = true;
  stroke(game, [[0, 1], [1, 1]]);
  const xs = [...game.board.keys()].filter((i) => game.board[i] === MARK_X);
  // Row 0 (clue 2) and column 1 (clue 1) are finished; column 0 (1, 1) isn't.
  assert.deepEqual(xs, [2, 3, 4, 6, 11, 16, 21]);
  game.undo();
  assert.ok(game.board.every((v) => v === 0), 'one undo reverts fills and X marks');
  game.redo();
  assert.equal(game.board.filter((v) => v === MARK_X).length, 7);
});

test('cancelStroke reverts without an undo step', () => {
  const { game } = newGame();
  game.beginStroke();
  game.setCell(0, 1);
  game.setCell(1, 1);
  game.cancelStroke();
  game.endStroke();
  assert.ok(game.board.every((v) => v === 0));
  assert.ok(!game.canUndo);
});

test('saved progress records the puzzle hash', () => {
  const { game, storage } = newGame();
  stroke(game, [[0, 1]]);
  game.flush();
  assert.equal(loadProgress(storage, game.key, 2, 25)?.hash, game.hash);
});

// Hints (SPEC §6.9). Row 1 (clue 0) forces five X marks.
test('hint fills one forced cell as its own undo step and counts it', () => {
  const { game, storage } = newGame();
  game.autoX = true;
  const hint = game.hint(5);
  assert.deepEqual(hint, { kind: 'cell', cell: 5, value: MARK_X, line: { axis: 'row', index: 1 } });
  assert.equal(game.board.filter((v) => v !== 0).length, 1, 'one cell, no auto-X');
  assert.equal(game.hints, 1);
  assert.ok(game.started, 'the clock runs');
  game.undo();
  assert.ok(game.board.every((v) => v === 0));
  assert.equal(game.hints, 1, 'undo does not refund a hint');
  game.redo();
  assert.equal(game.board[5], MARK_X);
  game.flush();
  assert.equal(loadProgress(storage, game.key, 2, 25)?.hints, 1);
  assert.equal(newGame(storage).game.hints, 1, 'loaded with the progress');
});

test('hint on a wrong board changes nothing and is not counted', () => {
  const { game } = newGame();
  stroke(game, [[5, 1]]);
  assert.deepEqual(game.hint(), { kind: 'wrong', cells: [5] });
  assert.equal(game.hints, 0);
  assert.equal(game.checks, 0);
  assert.deepEqual([...game.board.keys()].filter((i) => game.board[i]), [5]);
});

test('hint reports a stuck solver without counting (fixture is not line-solvable)', () => {
  const { game } = newGame();
  let n = 0;
  for (let h = game.hint(); h?.kind === 'cell'; h = game.hint()) n++;
  assert.equal(game.hint()?.kind, 'stuck');
  assert.equal(game.hints, n);
  assert.ok(!game.solved);
});

test('hints can finish the puzzle; disabled once solved; restart clears them', () => {
  let solvedCalls = 0;
  const def = puzzle();
  def.cells.fill(0);
  def.cells.fill(1, 0, 5);
  def.cells[12] = 2;
  const game = new Game(fromDefinition(def), memoryStorage(), () => solvedCalls++);
  let n = 0;
  while (!game.solved) {
    assert.equal(game.hint(n)?.kind, 'cell');
    assert.ok(++n <= 25);
  }
  assert.equal(solvedCalls, 1);
  assert.equal(game.hints, n);
  assert.equal(game.hint(), null);
  game.restart();
  assert.equal(game.hints, 0);
});

test('records without hints load as 0', () => {
  const storage = memoryStorage();
  const loaded = fromDefinition(puzzle());
  const board = new Uint8Array(25);
  board[0] = 1;
  saveProgress(storage, loaded.key, 2, { board, elapsedMs: 5, checks: 1, hints: 4, solved: false });
  const key = `picross:p:${loaded.key}`;
  const { hints, ...legacy } = JSON.parse(storage.getItem(key)!);
  assert.equal(hints, 4);
  storage.setItem(key, JSON.stringify(legacy));
  assert.equal(loadProgress(storage, loaded.key, 2, 25)?.hints, 0);
});
