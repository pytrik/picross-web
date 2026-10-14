/** Grid styles for generation (SPEC §5.6). */
export type Style = 'random' | 'symmetric' | 'smooth';

export const STYLES: readonly Style[] = ['random', 'symmetric', 'smooth'];

export const STYLE_LABELS: Record<Style, string> = {
  random: 'Random',
  symmetric: 'Symmetric',
  smooth: 'Smooth',
};

export type Rng = () => number;

/** How one attempt seeds its grid and picks repairs. */
export interface Layout {
  /** Top-left part holding every orbit's first cell; color seeds go here. */
  region: { width: number; height: number };
  /** The cells that change together with `cell` (its mirror images). */
  orbit(cell: number): number[];
  /** Initial fill mask, 1 = filled, close to `density`. */
  seed(density: number, rng: Rng): Uint8Array;
  /** Which undetermined cell to flip next. */
  pick(open: number[], cells: Uint8Array, rng: Rng): number;
}

const randomPick = (open: number[], rng: Rng) => open[Math.floor(rng() * open.length)]!;

function noise(size: number, density: number, rng: Rng): Uint8Array {
  return Uint8Array.from({ length: size }, () => (rng() < density ? 1 : 0));
}

/** 4-neighbours inside the grid. */
function neighbours(width: number, height: number, cell: number): number[] {
  const x = cell % width;
  const y = Math.floor(cell / width);
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x < width - 1) out.push(cell + 1);
  if (y > 0) out.push(cell - width);
  if (y < height - 1) out.push(cell + width);
  return out;
}

/** Share of filled cells that have no filled 4-neighbour (SPEC §5.6). */
export function isolatedShare(width: number, height: number, cells: ArrayLike<number>): number {
  let filled = 0;
  let isolated = 0;
  for (let i = 0; i < width * height; i++) {
    if (!cells[i]) continue;
    filled++;
    if (!neighbours(width, height, i).some((n) => cells[n])) isolated++;
  }
  return filled ? isolated / filled : 0;
}

export function makeLayout(style: Style, width: number, height: number, rng: Rng): Layout {
  if (style === 'symmetric') return symmetric(width, height, rng);
  if (style === 'smooth') return smooth(width, height);
  return {
    region: { width, height },
    orbit: (cell) => [cell],
    seed: (density, r) => noise(width * height, density, r),
    pick: (open, _cells, r) => randomPick(open, r),
  };
}

/**
 * Mirror symmetry, chosen at random per attempt: left-right, top-bottom, or
 * both. A cell and its mirror images always hold the same value.
 */
function symmetric(width: number, height: number, rng: Rng): Layout {
  const mode = Math.floor(rng() * 3);
  const mirrorX = mode !== 1;
  const mirrorY = mode !== 0;
  const orbit = (cell: number) => {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const xs = mirrorX ? [x, width - 1 - x] : [x];
    const ys = mirrorY ? [y, height - 1 - y] : [y];
    return [...new Set(ys.flatMap((yy) => xs.map((xx) => yy * width + xx)))];
  };
  return {
    region: { width: mirrorX ? Math.ceil(width / 2) : width, height: mirrorY ? Math.ceil(height / 2) : height },
    orbit,
    seed(density, r) {
      const cells = new Uint8Array(width * height);
      for (let i = 0; i < cells.length; i++) {
        const members = orbit(i);
        if (Math.min(...members) !== i) continue;
        const v = r() < density ? 1 : 0;
        for (const m of members) cells[m] = v;
      }
      return cells;
    },
    pick: (open, _cells, r) => randomPick(open, r),
  };
}

/**
 * Blob-like shapes: noise smoothed by two majority passes over each 3×3
 * window, then grown or shrunk at the blob edges back to the density. Repairs
 * prefer cells whose flip agrees with their neighbours.
 */
function smooth(width: number, height: number): Layout {
  const size = width * height;
  const filledAround = (cells: Uint8Array, cell: number) => neighbours(width, height, cell).filter((n) => cells[n]).length;

  function majority(cells: Uint8Array): Uint8Array {
    const next = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      let total = 0;
      let filled = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          total++;
          filled += cells[yy * width + xx]!;
        }
      }
      next[i] = filled * 2 > total ? 1 : filled * 2 < total ? 0 : cells[i]!;
    }
    return next;
  }

  /** Grows (or shrinks) at the edges, most-surrounded cells first. */
  function fixDensity(cells: Uint8Array, density: number, rng: Rng) {
    const target = Math.round(density * size);
    let count = cells.reduce((a, b) => a + b, 0);
    while (count !== target) {
      const grow = count < target;
      let best: number[] = [];
      let bestScore = -1;
      for (let i = 0; i < size; i++) {
        if (cells[i] === (grow ? 1 : 0)) continue;
        const around = filledAround(cells, i);
        const score = grow ? around : 4 - around;
        if (score > bestScore) {
          bestScore = score;
          best = [i];
        } else if (score === bestScore) best.push(i);
      }
      const cell = randomPick(best, rng);
      cells[cell] = grow ? 1 : 0;
      count += grow ? 1 : -1;
    }
  }

  return {
    region: { width, height },
    orbit: (cell) => [cell],
    seed(density, rng) {
      let cells = noise(size, density, rng);
      cells = majority(majority(cells));
      fixDensity(cells, density, rng);
      return cells;
    },
    pick(open, cells, rng) {
      // A filled cell with mostly empty neighbours (or the reverse) is a
      // smoothing flip.
      const smoothing = open.filter((i) => {
        const n = neighbours(width, height, i).length;
        const around = filledAround(cells, i);
        return cells[i] ? around * 2 < n : around * 2 > n;
      });
      return randomPick(smoothing.length ? smoothing : open, rng);
    },
  };
}
