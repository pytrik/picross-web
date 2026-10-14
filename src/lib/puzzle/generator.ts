import { validatePuzzle } from './codec.ts';
import { computeClues } from './clues.ts';
import { DENSITY_BANDS, ratePuzzle, type Target } from './rating.ts';
import { isSingle, solveGrid } from './solver.ts';
import { makeLayout, type Rng, type Style } from './styles.ts';
import type { PuzzleDef } from './types.ts';

export type { Rng };

export interface GenerateOptions {
  width: number;
  height: number;
  palette: string[];
  /** Probability a cell is filled, 0.40..0.75. Ignored with a target difficulty. */
  density: number;
  /** Target difficulty (SPEC §5.5); 'any' or absent uses `density`. */
  difficulty?: Target;
  /** Grid style (SPEC §5.6); absent = 'random'. */
  style?: Style;
}

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

/**
 * Color assignment: nearest of N seed points (Voronoi), SPEC §5.2. Seeds are
 * distinct random filled cells of `mask` inside `region` (the top-left part a
 * symmetric layout copies), so every color starts with at least one cell.
 */
function makeColorer(width: number, colors: number, rng: Rng, region: { width: number; height: number }, mask: Uint8Array) {
  const candidates: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && i % width < region.width && Math.floor(i / width) < region.height) candidates.push(i);
  }
  const seeds = Array.from({ length: colors }, () => {
    if (!candidates.length) return [rng() * region.width, rng() * region.height] as const;
    const cell = candidates.splice(Math.floor(rng() * candidates.length), 1)[0]!;
    return [cell % width, Math.floor(cell / width)] as const;
  });
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

export interface Generated {
  def: PuzzleDef;
  /** Style actually used: Random if the requested one had to be dropped. */
  style: Style;
}

/**
 * Generates a puzzle with a unique solution reachable by line logic alone,
 * at the target difficulty if one is given (SPEC §5.2, §5.5), in the
 * requested style when possible (§5.6). Returns null when the time budget
 * runs out or it is cancelled.
 */
export function generate(opts: GenerateOptions, rng: Rng = cryptoRng(), limits: GenerateLimits = {}): Generated | null {
  const budget = limits.timeBudgetMs ?? 10_000;
  const start = Date.now();
  const deadline = start + budget;
  const target = opts.difficulty ?? 'any';
  while (Date.now() < deadline && !limits.cancelled?.()) {
    // Style is best effort: some combinations (e.g. Smooth + Hard on a thin
    // board) are practically unreachable, so the last two thirds use Random.
    const style = Date.now() - start < budget / 3 ? (opts.style ?? 'random') : 'random';
    let density = opts.density;
    if (target !== 'any') {
      const [lo, hi] = DENSITY_BANDS[target];
      density = lo + rng() * (hi - lo);
    }
    const def = attempt(opts, style, density, rng, deadline);
    if (def && (target === 'any' || ratePuzzle(def) === target)) return { def, style };
  }
  return null;
}

/** `generate` without the style report. */
export function generatePuzzle(opts: GenerateOptions, rng: Rng = cryptoRng(), limits: GenerateLimits = {}): PuzzleDef | null {
  return generate(opts, rng, limits)?.def ?? null;
}

/** One seed grid plus repairs (SPEC §5.2 steps 1–4); null if it fails. */
function attempt(opts: GenerateOptions, style: Style, density: number, rng: Rng, deadline: number): PuzzleDef | null {
  const { width, height, palette } = opts;
  const colors = palette.length;
  const maxRepairs = width * height;
  const layout = makeLayout(style, width, height, rng);
  const mask = layout.seed(density, rng);
  const voronoi = makeColorer(width, colors, rng, layout.region, mask);
  // Mirror images take the color of their orbit's first cell (symmetric style).
  const colorOf = (cell: number) => voronoi(Math.min(...layout.orbit(cell)));
  const cells = mask.map((v, i) => (v ? colorOf(i) : 0));

  for (let repair = 0; repair <= maxRepairs && Date.now() < deadline; repair++) {
    const result = solveGrid(computeClues({ width, height, cells }), width, height, colors);
    if (result.contradiction) throw new Error('Solver contradiction on generated clues');
    if (result.solved) {
      if (!usesAllColors(cells, colors)) return null; // restart with a fresh grid
      const def: PuzzleDef = { width, height, palette: [...palette], cells };
      validatePuzzle(def);
      return def;
    }
    // Flip an undetermined cell (with its mirror images) and try again.
    const open: number[] = [];
    result.masks.forEach((m, i) => {
      if (!isSingle(m)) open.push(i);
    });
    const cell = layout.pick(open, cells, rng);
    const fill = !cells[cell];
    for (const m of layout.orbit(cell)) cells[m] = fill ? colorOf(m) : 0;
  }
  return null;
}
