import { validatePuzzle } from './codec.ts';
import { computeClues } from './clues.ts';
import { DENSITY_BANDS, ratePuzzle, type Target } from './rating.ts';
import { isSingle, solveGrid } from './solver.ts';
import type { PuzzleDef } from './types.ts';

export interface GenerateOptions {
  width: number;
  height: number;
  palette: string[];
  /** Probability a cell is filled, 0.40..0.75. Ignored with a target difficulty. */
  density: number;
  /** Target difficulty (SPEC §5.5); 'any' or absent uses `density`. */
  difficulty?: Target;
}

export type Rng = () => number;

/** mulberry32: small, fast, good enough for puzzle layout. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRng(): Rng {
  return mulberry32(crypto.getRandomValues(new Uint32Array(1))[0]!);
}

/** Color assignment: nearest of N random seed points (Voronoi), SPEC §5.2. */
function makeColorer(width: number, height: number, colors: number, rng: Rng) {
  const seeds = Array.from({ length: colors }, () => [rng() * width, rng() * height] as const);
  return (cell: number) => {
    if (colors === 1) return 1;
    const x = cell % width;
    const y = Math.floor(cell / width);
    let best = 0;
    let bestDist = Infinity;
    seeds.forEach(([sx, sy], i) => {
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best + 1;
  };
}

function seedGrid(width: number, height: number, density: number, rng: Rng, colorOf: (cell: number) => number): Uint8Array {
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = rng() < density ? colorOf(i) : 0;
  return cells;
}

/** Every palette color appears and at least one cell is filled. */
function usesAllColors(cells: Uint8Array, colors: number): boolean {
  const seen = new Set<number>();
  for (const v of cells) if (v) seen.add(v);
  return seen.size === colors;
}

export interface GenerateLimits {
  /** Give up after this many ms (SPEC §5.2: 10 s). */
  timeBudgetMs?: number;
  /** Polled between attempts; return true to abort. */
  cancelled?: () => boolean;
}

/**
 * Generates a puzzle with a unique solution reachable by line logic alone,
 * at the target difficulty if one is given (SPEC §5.2, §5.5). Returns null
 * when the time budget runs out or it is cancelled.
 */
export function generatePuzzle(opts: GenerateOptions, rng: Rng = cryptoRng(), limits: GenerateLimits = {}): PuzzleDef | null {
  const deadline = Date.now() + (limits.timeBudgetMs ?? 10_000);
  const target = opts.difficulty ?? 'any';
  while (Date.now() < deadline && !limits.cancelled?.()) {
    let density = opts.density;
    if (target !== 'any') {
      const [lo, hi] = DENSITY_BANDS[target];
      density = lo + rng() * (hi - lo);
    }
    const def = attempt(opts, density, rng, deadline);
    if (def && (target === 'any' || ratePuzzle(def) === target)) return def;
  }
  return null;
}

/** One seed grid plus repairs (SPEC §5.2 steps 1–4); null if it fails. */
function attempt(opts: GenerateOptions, density: number, rng: Rng, deadline: number): PuzzleDef | null {
  const { width, height, palette } = opts;
  const colors = palette.length;
  const maxRepairs = width * height;
  const colorOf = makeColorer(width, height, colors, rng);
  const cells = seedGrid(width, height, density, rng, colorOf);

  for (let repair = 0; repair <= maxRepairs && Date.now() < deadline; repair++) {
    const result = solveGrid(computeClues({ width, height, cells }), width, height, colors);
    if (result.contradiction) throw new Error('Solver contradiction on generated clues');
    if (result.solved) {
      if (!usesAllColors(cells, colors)) return null; // restart with a fresh grid
      const def: PuzzleDef = { width, height, palette: [...palette], cells };
      validatePuzzle(def);
      return def;
    }
    // Flip a random undetermined cell and try again.
    const open: number[] = [];
    result.masks.forEach((m, i) => {
      if (!isSingle(m)) open.push(i);
    });
    const cell = open[Math.floor(rng() * open.length)]!;
    cells[cell] = cells[cell] ? 0 : colorOf(cell);
  }
  return null;
}
