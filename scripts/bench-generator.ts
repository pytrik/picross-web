// Generator time budget check (SPEC §1.4 item 3): every style × target ×
// color count at the worst case (30×30, density 0.40), plus a thin board.
// Usage: npm run bench [-- runs]   (default 3 runs per combination)
import { generate } from '../src/lib/puzzle/generator.ts';
import { PALETTES } from '../src/lib/puzzle/palettes.ts';
import { ratePuzzle, type Target } from '../src/lib/puzzle/rating.ts';
import { STYLES } from '../src/lib/puzzle/styles.ts';

const BUDGET_MS = 10_000;
const runs = Number(process.argv[2] ?? 3);
const targets: Target[] = ['any', 'easy', 'medium', 'hard'];
const sizes = [
  [30, 30],
  [5, 30],
];

let failed = false;
for (const [width, height] of sizes) {
  for (const style of STYLES) {
    for (const difficulty of targets) {
      for (let colors = 1; colors <= 6; colors++) {
        const times: number[] = [];
        const notes = new Set<string>();
        for (let i = 0; i < runs; i++) {
          const palette = PALETTES[0]!.colors.slice(0, colors);
          const t0 = performance.now();
          const result = generate({ width: width!, height: height!, palette, density: 0.4, difficulty, style });
          times.push(performance.now() - t0);
          if (!result) notes.add('TIMEOUT');
          else {
            if (difficulty !== 'any' && ratePuzzle(result.def) !== difficulty) notes.add('WRONG RATING');
            if (result.style !== style) notes.add(`fell back to ${result.style}`);
          }
        }
        const max = Math.max(...times);
        const bad = notes.has('TIMEOUT') || notes.has('WRONG RATING') || max > BUDGET_MS;
        failed ||= bad;
        const line = `${width}x${height} ${style.padEnd(9)} ${difficulty.padEnd(6)} c${colors}  max ${max.toFixed(0).padStart(5)} ms  ${[...notes].join(', ')}`;
        console.log(bad ? `FAIL ${line}` : `     ${line}`);
      }
    }
  }
}
process.exit(failed ? 1 : 0);
