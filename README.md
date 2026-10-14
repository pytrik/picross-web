# Picross Web

> **AI disclosure:** this app was built mainly by AI. Essentially all of the
> code, tests and documentation were written by
> [Claude Opus](https://www.anthropic.com/claude) in
> [Claude Code](https://claude.com/claude-code), working from my requirements;
> I made the design decisions, reviewed the output and tested it.

A browser nonogram (picross) game with randomly generated, **multi-color**
puzzles. Every puzzle has a unique solution you can reach by logic alone, with
no guessing.

- **Shareable**: the whole puzzle lives in the URL hash. Send the link and
  your friend gets the exact same puzzle.
- **Reload-safe**: your progress, timer, and solved state are saved in your
  browser per puzzle (the last 50 are kept).
- **Single file**: the whole app is one self-contained `index.html` with no
  external requests, so it works offline.
- **Recent puzzles**: pick up any of your last 50 puzzles from a list with
  thumbnails of your progress.
- **Difficulty and style**: every puzzle is rated Easy, Medium or Hard, and
  you can ask for a difficulty and a Random, Symmetric or Smooth style.
- Undo/redo, a Hint button, mistake checks, dimmed clues for finished runs,
  impossible-line warnings, optional auto-X for finished lines, a run counter
  while dragging, timer, keyboard play, touch support with pinch-zoom, and
  light/dark theme.

**Play it at <https://picross-web.pytrik.workers.dev>**, or download the
offline `index.html` from the [latest release](https://github.com/pytrik/picross-web/releases/latest).

Full behaviour is specified in [SPEC.md](SPEC.md). The road to 1.0.0 is in
its §1.3: still to come are a puzzle editor and a curated puzzle library
(`#id=…` links served by a Worker + D1). The definition of done is §1.4.

## How to play

Each number is a run of consecutive filled cells in that row or column, drawn in
the run's color. Runs of the **same** color have at least one empty cell
between them; runs of **different** colors may touch.

| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Move cursor | — | — | Arrow keys (focus the board first) |
| Fill with active color | Left click / drag | Tap / drag | Space / Enter |
| Mark empty (X) | Right click / drag, or left with the X tool | Tap / drag with the X tool | `X` |
| Clear | Click a cell again | Tap again | Backspace / Delete |
| Repeat last action while moving | — | — | Shift + Arrow keys |
| Pick color | Click swatch | Tap swatch | `1`–`6` |
| Undo / redo | Toolbar | Toolbar | Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) |
| Zoom | Toolbar − / + | Pinch, or toolbar − / + | `-` / `+` |
| Hint | Toolbar | Toolbar | `H` |
| Pan (when zoomed) | Scroll wheel / scrollbars | Two fingers, or one finger on the clues | Arrow keys follow the cursor |

Drags stay on the row or column they start in, and only change cells that
were in the same state as the first one, so a drag never wipes out other work.
While dragging, a small counter shows how many cells the drag spans.
Dimmed clue numbers are runs your marks already complete; a red clue means
that line's marks can no longer fit it. **Options…** sets the theme
(Auto / Light / Dark), turns that warning off, and can switch on auto-X,
which marks the rest of a line empty as soon as its filled cells match the
clue.

Every puzzle is rated Easy, Medium or Hard by how long the chain of logical
steps is. In **New puzzle…** you can ask for a difficulty (Medium needs a
board of at least 75 cells, Hard at least 150); that picks the fill density
for you. You can also pick a style: Random, Symmetric (mirrored left-right,
top-bottom or both) or Smooth (blob-like shapes). Smooth puzzles are rarely
hard; if a combination can't be made in time you get a Random one, and the
app tells you.

Stuck? **Hint** fills in one cell that logic can deduce from your marks and
highlights the row or column that proves it. If you've made a mistake, it
points that out instead. Hints used are shown when you solve the puzzle.

## Development

Requires Node 24 LTS.

```bash
npm install
npm run dev        # http://localhost:3000 with live reload
npm run check      # type check (svelte-check)
npm test           # unit tests (node --test; *.svelte.ts compiled by a loader hook)
npm run build      # → dist/index.html (single file, open it directly)
npm run build:debug
npm run e2e        # build, then Playwright end-to-end tests
npm run bench      # generator time budget, every style × difficulty (minutes)
```

The e2e tests (`tests/e2e/`) run against the production build using your
installed Google Chrome (`channel: 'chrome'`), so no Playwright browser
download is needed. `npx playwright test --ui` is handy while writing tests.

CI (`.github/workflows/ci.yml`) runs the type check, unit tests, build and e2e
tests on every branch push and pull request.

Built with Svelte 5 + TypeScript and a small custom esbuild pipeline
(`scripts/build.mjs`) that inlines all JS and CSS into one HTML file.
TypeScript stays on 6.x until `svelte-check` supports 7.

## Deployment

Hosted on Cloudflare Workers static assets (`wrangler.jsonc`, serves
`dist/`).

Deploys happen **only** from GitHub Actions; there is no local deploy path
and no need to be logged in to wrangler.

**Release:** bump `"version"` in `package.json` (the header reads it at build
time), commit, then tag that exact version:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

The workflow checks the tag matches `package.json`, type-checks, runs unit
and e2e tests, builds, runs `wrangler deploy`, and attaches
`picross-web-vX.Y.Z.zip` (the offline `index.html`) to a GitHub Release. If
any check fails nothing is deployed; the Playwright report is uploaded as a
workflow artifact.

Repository secrets required: `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare
Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.

## License

MIT © Pytrik Elzinga
