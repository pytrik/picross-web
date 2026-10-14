import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bitsFor,
  decodePuzzle,
  encodePuzzle,
  fromBase64Url,
  packValues,
  parseHash,
  toBase64Url,
  unpackValues,
} from './codec.ts';
import { boardSatisfies, completedRuns, computeClues, lineClue } from './clues.ts';
import { generatePuzzle, mulberry32 } from './generator.ts';
import { fnv1a64 } from './key.ts';
import { solveGrid, solveLine, masksToCells } from './solver.ts';
import { MARK_X, PuzzleError, type PuzzleDef } from './types.ts';

const PALETTE = ['#222222', '#d94040', '#3070d0', '#e0a020', '#40a050', '#9050c0'];

/** Parses a picture: '.' empty, digits = colors. */
function grid(rows: string[], colors = 1): PuzzleDef {
  const height = rows.length;
  const width = rows[0]!.length;
  const cells = new Uint8Array(width * height);
  rows.forEach((row, r) => [...row].forEach((ch, c) => (cells[r * width + c] = ch === '.' ? 0 : Number(ch))));
  return { width, height, palette: PALETTE.slice(0, colors), cells };
}

// --- codec -------------------------------------------------------------------

test('base64url round-trips all lengths', () => {
  for (let len = 0; len < 20; len++) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
    const text = toBase64Url(bytes);
    assert.ok(!text.includes('='));
    assert.deepEqual(fromBase64Url(text), bytes);
  }
});

test('base64url rejects bad input', () => {
  assert.throws(() => fromBase64Url('A'), PuzzleError);
  assert.throws(() => fromBase64Url('AB+/'), PuzzleError);
  assert.throws(() => fromBase64Url('AB'), PuzzleError); // non-zero leftover bits
});

test('bitsFor matches the spec table', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(bitsFor), [1, 2, 2, 3, 3, 3]);
});

test('bit packing is MSB-first and rejects padding', () => {
  assert.deepEqual(packValues([1, 0, 1], 1), Uint8Array.of(0b1010_0000));
  assert.deepEqual(packValues([3, 1], 2), Uint8Array.of(0b1101_0000));
  assert.deepEqual(unpackValues(Uint8Array.of(0b1101_0000), 2, 2), Uint8Array.of(3, 1));
  assert.throws(() => unpackValues(Uint8Array.of(0b1101_0001), 2, 2), /padding/);
  assert.throws(() => unpackValues(Uint8Array.of(0, 0), 2, 2), /length/);
});

test('puzzle hash round-trips for every color count', () => {
  const rng = mulberry32(42);
  for (let colors = 1; colors <= 6; colors++) {
    const width = 7;
    const height = 6;
    const cells = new Uint8Array(width * height);
    for (let i = 0; i < cells.length; i++) cells[i] = i < colors ? i + 1 : Math.floor(rng() * (colors + 1));
    const def: PuzzleDef = { width, height, palette: PALETTE.slice(0, colors), cells };
    const hash = encodePuzzle(def);
    assert.match(hash, /^p=1\.7x6\.[0-9a-f-]+\.[A-Za-z0-9_-]+$/);
    const back = decodePuzzle(hash.slice(2));
    assert.deepEqual(back, def);
    assert.equal(encodePuzzle(back), hash, 'canonical');
  }
});

test('decodePuzzle rejects malformed definitions', () => {
  const good = encodePuzzle(grid(['1....', '.1...', '..1..', '...1.', '....1'])).slice(2);
  assert.doesNotThrow(() => decodePuzzle(good));
  const [, size, pal, data] = good.split('.');
  const bad = [
    `2.${size}.${pal}.${data}`, // version
    `1.4x5.${pal}.${data}`, // too small
    `1.31x5.${pal}.${data}`, // too large
    `1.05x5.${pal}.${data}`, // leading zero
    `1.${size}.ZZZZZZ.${data}`, // palette chars
    `1.${size}.${pal}-${pal}.${data}`, // duplicate color
    `1.${size}.${pal}-ff0000.${data}`, // unused color (and wrong bit width)
    `1.${size}.${pal}.${data}AA`, // length
    `1.${size}.${pal}`, // parts
    `1.${size}.${pal}.AAAAA`, // empty grid
  ];
  for (const value of bad) assert.throws(() => decodePuzzle(value), PuzzleError, value);
});

test('parseHash classifies hashes', () => {
  assert.deepEqual(parseHash(''), { kind: 'none' });
  assert.deepEqual(parseHash('#'), { kind: 'none' });
  assert.deepEqual(parseHash('#p=1.5x5'), { kind: 'puzzle', value: '1.5x5' });
  assert.deepEqual(parseHash('#id=abc%20d'), { kind: 'id', id: 'abc d' });
  assert.deepEqual(parseHash('#foo'), { kind: 'invalid' });
});

test('fnv1a64 matches reference vectors', () => {
  assert.equal(fnv1a64(''), 'cbf29ce484222325');
  assert.equal(fnv1a64('a'), 'af63dc4c8601ec8c');
});

// --- clues -------------------------------------------------------------------

test('clues: different colors touch, same colors separate', () => {
  assert.deepEqual(lineClue([1, 1, 2, 2, 2, 0, 1]), [
    { len: 2, color: 1 },
    { len: 3, color: 2 },
    { len: 1, color: 1 },
  ]);
  assert.deepEqual(lineClue([0, 0, 0]), []);
});

test('boardSatisfies ignores X marks', () => {
  const def = grid(['11...', '.....', '..2..', '.....', '1...2'], 2);
  const clues = computeClues(def);
  const board = def.cells.map((v) => (v ? v : MARK_X));
  assert.ok(boardSatisfies(clues, 5, 5, board));
  board[3] = 1;
  assert.ok(!boardSatisfies(clues, 5, 5, board));
});

test('completedRuns: full match, ends, and stopping at unknowns', () => {
  const X = MARK_X;
  const clue = lineClue([1, 1, 0, 2, 0, 1, 0, 0]); // 2a 1b 1a
  assert.deepEqual(completedRuns(clue, [1, 1, X, 2, X, 1, X, X]), [true, true, true]);
  assert.deepEqual(completedRuns(clue, [1, 1, X, 0, 0, 0, 0, 0]), [true, false, false]);
  assert.deepEqual(completedRuns(clue, [1, 1, 0, 0, 0, 0, 0, 0]), [false, false, false]); // unbounded
  assert.deepEqual(completedRuns(clue, [0, 0, 0, 0, X, 1, X, X]), [false, false, true]);
  assert.deepEqual(completedRuns(clue, [1, X, 0, 0, 0, 0, 0, 0]), [false, false, false]); // wrong length
});

// --- solver ------------------------------------------------------------------

test('solveLine overlaps a single long run', () => {
  const full = 0b11;
  const res = solveLine([{ len: 4, color: 1 }], [full, full, full, full, full])!;
  assert.deepEqual(res, [3, 2, 2, 2, 3]);
});

test('solveLine forces gap only between same colors', () => {
  const full = 0b111;
  // 2 red + 2 blue in 4 cells: fully determined, touching.
  assert.deepEqual(solveLine([{ len: 2, color: 1 }, { len: 2, color: 2 }], Array(4).fill(full)), [2, 2, 4, 4]);
  // Two same-color runs of 2 need 5 cells.
  assert.equal(solveLine([{ len: 2, color: 1 }, { len: 2, color: 1 }], Array(4).fill(full)), null);
});

test('solveGrid solves a known unique puzzle', () => {
  const def = grid(['11111', '1....', '22222', '....1', '11111'], 2);
  const res = solveGrid(computeClues(def), 5, 5, 2);
  assert.ok(res.solved);
  assert.deepEqual(masksToCells(res.masks), def.cells);
});

test('solveGrid never excludes the true solution', () => {
  const rng = mulberry32(99);
  for (let n = 0; n < 200; n++) {
    const colors = 1 + (n % 4);
    const def = grid(Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => {
      const v = Math.floor(rng() * (colors + 1));
      return v ? String(v) : '.';
    }).join('')), colors);
    const res = solveGrid(computeClues(def), 7, 6, colors);
    assert.ok(!res.contradiction);
    def.cells.forEach((v, i) => assert.ok(res.masks[i]! & (1 << v), `cell ${i} lost its value`));
  }
});

test('solveGrid does not fully solve an ambiguous puzzle', () => {
  // Diagonal vs anti-diagonal: same clues.
  const def = grid(['1....', '.1...', '.....', '.....', '.....'].map((r, i) => (i < 2 ? r : '.....')));
  const res = solveGrid(computeClues(def), 5, 5, 1);
  assert.ok(!res.solved && !res.contradiction);
});

// --- generator ---------------------------------------------------------------

test('generator yields valid, line-solvable puzzles for every color count', () => {
  const rng = mulberry32(7);
  for (let colors = 1; colors <= 6; colors++) {
    for (let i = 0; i < 3; i++) {
      const def = generatePuzzle({ width: 10, height: 8, palette: PALETTE.slice(0, colors), density: 0.58 }, rng);
      assert.ok(def, `generated ${colors} colors`);
      assert.ok(solveGrid(computeClues(def), def.width, def.height, colors).solved);
      assert.doesNotThrow(() => decodePuzzle(encodePuzzle(def).slice(2)));
    }
  }
});
