# Picross Web — Specification

Status: **v1, implemented** (live at <https://picross-web.pytrik.workers.dev>).
This document is the source of truth for behaviour. When the code and this spec disagree, one of them is a bug.

Keywords **MUST**, **SHOULD**, **MAY** are used in the RFC 2119 sense.

---

## 1. Scope

### 1.1 v1 (this spec)

- Randomly generated, multi-color nonogram ("picross") puzzles.
- Every generated puzzle has a **unique solution reachable by line logic alone**
  (no guessing).
- Puzzle definition lives in the URL hash → reload- and share-safe.
- Player progress lives in `localStorage` → survives reloads.
- Shipped as **one self-contained `index.html`** (no external requests), hosted
  on Cloudflare Workers static assets.

### 1.2 Explicitly out of scope for v1 (but designed for)

- Loading puzzles from a backend database (see §11).
- Accounts, leaderboards, cloud sync.
- Hand-authored puzzle editor.

### 1.3 Planned (not yet specified)

Agreed for a later version; each gets a proper spec section before work starts.

- **Hint**: reveal one cell that line logic forces next (reusing §5.3), with
  its line highlighted; hints used are shown on win.
- **Difficulty rating**: grade puzzles by solver effort (Easy/Medium/Hard),
  shown in the toolbar; optional target difficulty in the generator, within
  the 10 s budget.
- **Picture-like grids**: optional symmetry / smoothing in the seed step so
  puzzles look less like noise.
- **Puzzle editor**: draw a grid, check it is line-solvable (§5.3), share as a
  `p=` link.
- **Database puzzles**: `#id=` links backed by a Worker + D1 (§11).

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Puzzle / definition** | Width, height, palette, and solution grid. Immutable. |
| **Palette** | Ordered list of 1–6 colors (`#rrggbb`). Index 1..N in the grid. |
| **Solution cell** | `0` = empty, `1..N` = palette color index. |
| **Board / progress** | The player's marks. Mutable. |
| **Board cell** | `0` = unknown, `1..N` = filled with color, `X` = marked empty. |
| **Line** | One row or one column. |
| **Run** | Maximal sequence of consecutive same-colored solution cells in a line. |
| **Clue** | Ordered list of runs for a line, each `(length, color)`. |
| **Puzzle key** | Stable identifier of a definition, used for storage (§7.2). |

---

## 3. Puzzle rules

### 3.1 Clues

For each line, the clue lists its runs in order (left→right for rows,
top→bottom for columns). Each run is shown as its length, rendered in its color.

Multi-color rule (standard):

- Two consecutive runs of the **same** color MUST be separated by at least one
  empty cell.
- Two consecutive runs of **different** colors MAY touch (zero gap).

An empty line has clue `0` (rendered as a dim `0`).

### 3.2 Win condition

The puzzle is solved when, for every cell, the board cell equals the solution
cell, where board `unknown` and `X` both count as "empty". Because generated
puzzles are unique (§5), this is equivalent to "every clue is satisfied".

On solve:

- Timer stops (§6.5).
- Board becomes read-only (X marks and unknown cells render as empty; filled
  cells stay; no row/column hover highlighting).
- A dialog shows: size, colors, elapsed time, number of mistake checks used,
  and three actions:
  - **Close**: dismiss, keep looking at the solved board.
  - **New puzzle…**: opens the same settings dialog as the header button.
  - **Play another**: immediately generates a new puzzle with the solved
    puzzle's size and palette (which may differ from the saved settings when
    the puzzle came from a shared link) and the saved density (density is not
    part of a definition). Saved settings are not changed.
- State is persisted as solved; reopening the link shows the solved board.

---

## 4. Puzzle definition & URL hash

### 4.1 Data model

```ts
interface PuzzleDef {
  width: number;          // 5..30
  height: number;         // 5..30
  palette: string[];      // 1..6 entries, lowercase "#rrggbb"
  cells: Uint8Array;      // width*height, row-major, values 0..palette.length
  // Reserved for future DB puzzles (§11); not encoded in v1 hashes.
  id?: string;
  title?: string;
}
```

Validation (applies to hash decode and any future source):

- `width`, `height` integers in `[5, 30]`.
- `palette.length` in `[1, 6]`, each matching `/^#[0-9a-f]{6}$/`, no duplicates.
- Every cell value `<= palette.length`.
- Every palette color MUST be used at least once (otherwise the palette is
  misleading).
- Grid MUST contain at least one filled cell.

Invalid definitions are rejected (§4.4).

### 4.2 Hash format (v1)

```
#p=1.<W>x<H>.<PALETTE>.<DATA>
```

| Part | Format | Example |
|---|---|---|
| `1` | Format version, decimal | `1` |
| `<W>x<H>` | Decimal width × height | `15x10` |
| `<PALETTE>` | Hex colors without `#`, lowercase, joined by `-` | `222222-e04040-3070d0` |
| `<DATA>` | base64url (RFC 4648 §5, **no padding**) of the bit-packed grid | `AbC_9...` |

Bit packing:

- `bits = ceil(log2(N + 1))` where `N = palette.length` → 1 bit for 1 color,
  2 bits for 2–3 colors, 3 bits for 4–6 colors.
- Cells in row-major order, each written as `bits` bits, **MSB-first** within a
  byte stream. The final byte is zero-padded on the right.
- Decoders MUST reject data whose decoded byte length is not exactly
  `ceil(W*H*bits / 8)`, and MUST reject non-zero padding bits.

Size budget: 30×30 with 6 colors = 338 bytes → 451 chars of data. Acceptable.

Other hash keys are reserved: `#id=<string>` for DB puzzles (§11). Unknown
format versions MUST be treated as invalid, not guessed at.

The app MUST produce canonical hashes (lowercase hex, no padding) so that equal
definitions produce equal strings.

### 4.3 Hash lifecycle

| Situation | Behaviour |
|---|---|
| Load with valid `#p=` | Show that puzzle; restore progress if stored. |
| Load with no hash | Generate with last-used settings (§8), then `history.replaceState` the hash (no extra history entry). |
| User generates a puzzle (**Generate** in the New puzzle dialog, or **Play another**) | Generate, then `history.pushState` the hash (creates a history entry, so Back returns to the previous puzzle; pushState does not fire `hashchange`, so no double load). |
| `hashchange` event (Back/Forward, pasted link) | Load the new puzzle; the old one's progress is already persisted. A generation still in flight is cancelled, so it cannot replace the puzzle being navigated to. |

### 4.4 Invalid hash

Show a non-blocking notice ("This puzzle link is invalid or from a newer
version") and generate a fresh puzzle via `replaceState`.

---

## 5. Random generation

### 5.1 Options

| Option | Range | Default |
|---|---|---|
| Width | 5–30 | 10 |
| Height | 5–30 | 10 |
| Size presets | 5×5, 10×10, 15×15, 20×20, 25×25, custom | 10×10 |
| Color count | 1–6 | 1 |
| Palette preset | see §5.4 | "Classic" |
| Per-swatch override | color input per swatch | — |
| Fill density | 0.40–0.75 | 0.58 |

Last-used options persist (§7.3).

### 5.2 Algorithm

1. **Seed grid.** Each cell is filled with probability `density`. Filled cells
   get a color. For `N > 1`, colors SHOULD be spatially coherent rather than
   per-cell noise: pick `N` random seed points and assign each filled cell the
   color of its nearest seed (Voronoi). A finished grid that does not use every
   color is discarded and generation restarts from step 1.
2. **Line-solve** (§5.3) from an empty board using only clues.
3. If fully solved → done (the result is unique and needs no guessing).
4. Otherwise **repair**: pick a random cell the solver left undetermined, flip
   it in the solution (empty↔filled; for filled cells pick a color per rule 1),
   re-validate, and go to step 2. Repeat up to `maxRepairs = W*H`.
5. If repairs run out, restart from step 1. Give up after a time budget
   (default 10 s) and show an error with a **Retry** button.

Generation MUST run off the main thread (Web Worker, §10.3) and the UI MUST show
a spinner + **Cancel**.

Generation uses `crypto.getRandomValues`-seeded PRNG. Determinism is NOT
required: the hash carries the full grid, so seeds are never shared.

### 5.3 Line solver

Standard multi-color line solver:

- Cell state is a bitset of possibilities `{empty, c1..cN}`.
- For each line, compute for every cell the set of states consistent with at
  least one placement of the clue's runs given current knowledge (left-most /
  right-most placement DP, or full placement DP over runs × positions).
  Intersect with current state.
- Iterate rows/columns using a work queue of changed lines until fixpoint.
- Contradiction (empty set) means the clues are inconsistent → treat as a
  generator bug (assert).

The same solver is reused by tests and MAY later back a "hint" feature.

### 5.4 Palette presets

Each preset defines 6 colors; a puzzle with `N` colors uses the first `N`.
Initial set (tunable during implementation, must stay distinguishable in both
light and dark themes and for common color-vision deficiencies where possible):

| Preset | Colors (first 6) |
|---|---|
| Classic | `#222222 #d94040 #3070d0 #e0a020 #40a050 #9050c0` |
| Pastel | `#5a6a7a #f08a8a #8ab4f0 #f0d27a #8fd19e #c5a3e8` |
| Earth | `#3b2f2a #a0522d #6b8e23 #d2b48c #4682b4 #cd853f` |
| High contrast | `#000000 #e69f00 #56b4e9 #009e73 #f0e442 #d55e00` (Okabe-Ito) |

The user MAY override individual swatches. Duplicate colors MUST be prevented
(the generate button is disabled with a hint).

---

## 6. Gameplay & input

### 6.1 Tools

- **Color swatches** (1..N): selecting one makes it the active fill color.
  Keyboard `1`–`6`.
- **Mark X** tool: an X button after the color swatches, shown on every
  device. Selecting a swatch (or pressing `1`–`6`) switches back to filling.
- Primary button / tap / drag applies the active tool (the selected color, or X
  when the X tool is selected). Secondary button (right-click) always marks X.
  Context menu suppressed on the board.

### 6.2 Click semantics

| Current cell | Fill with color c | Mark X |
|---|---|---|
| unknown | → c | → X |
| c | → unknown | → X |
| other color d | → c | → X |
| X | → c | → unknown |

### 6.3 Drag semantics

- The action is decided by the **first cell** (per §6.2) and applied to every
  cell entered during the drag.
- The drag only affects cells whose state equals the first cell's **original**
  state (so dragging to fill never erases existing work, and dragging to erase
  only erases that color).
- After the pointer leaves the first cell, the drag is **locked to the
  dominant axis** (row or column).
- One drag = one undo step.
- **Run counter**: while a drag spans 2 or more cells, a small badge above the
  pointer shows the span length (cells from the first cell to the current
  one along the locked axis), so long runs can be measured without counting.
  It is visual only (`aria-hidden`) and disappears when the drag ends.
- Uses Pointer Events with `setPointerCapture`; `touch-action: none` on the
  board container (touch panning and zooming are handled by the app, §6.7).
- A second touch while a drag is in progress **cancels the drag** (its cells
  revert, no undo step) and starts a pinch/pan gesture instead.

### 6.4 Keyboard

| Key | Action |
|---|---|
| Arrows | Move cursor (visible focus ring on the board) |
| Space / Enter | Fill at cursor with active color |
| `X` | Mark X at cursor |
| Backspace / Delete | Clear cell to unknown |
| Shift + Arrows | Move and apply the last action (keyboard drag) |
| `1`–`6` | Select color |
| `+` / `=`, `-` | Zoom in / out (§6.7) |
| Ctrl/Cmd+Z, Ctrl+Y / Ctrl/Cmd+Shift+Z | Undo / redo |

Moving the cursor scrolls it into view when the board is zoomed, clear of the
sticky clues.

### 6.5 Assists

- **Undo/redo**: unlimited within the session, per puzzle, in memory only
  (lost on reload; the board itself is not). Toolbar buttons + shortcuts.
- **Clue completion hints**: computed from the board alone (never from the
  solution, so they can't spoil anything):
  - A line whose filled cells exactly match its clue renders its whole clue
    dimmed.
  - Otherwise, individual runs are dimmed when they are provably placed:
    scanning from each end, a run of filled cells bounded by the edge/X (or
    by a different color) on both sides that matches the next expected clue run
    dims that clue run. Scanning stops at the first unknown cell.
- **Line errors** (option, default **on**): a line whose marks admit no
  placement of its clue is flagged: its clue gets a red tint. Computed from
  the board alone with the line solver (§5.3): unknown cells allow every
  state, X allows only empty, a filled cell only its color. This catches too
  many filled cells, runs too long, wrong order, and X marks that block a run,
  but never reveals anything the clue doesn't already imply.
- **Auto-X** (option, default **off**): after a stroke, every line the stroke
  changed whose filled cells now exactly match its clue gets its remaining
  unknown cells marked X. The X marks join the player's stroke (one undo step
  undoes both). Undo/redo never trigger auto-X. No cascade is needed: adding X
  marks cannot complete another line.
- **Mistake check** (button): highlights for 2 s every board cell that
  contradicts the solution (filled with the wrong color, filled where empty, or
  X where filled). If there are none, show "No mistakes so far". Each press
  increments `checks` (shown on win).
- **Timer**: elapsed play time, `mm:ss` (`h:mm:ss` past an hour). Starts on
  the first board change, pauses while the tab is hidden
  (`visibilitychange`), stops on solve. Persisted. Opening a puzzle that has
  any marks resumes the timer immediately, without waiting for a move, so a
  reload cannot be used to pause it.
- **Restart**: (with confirm dialog) clears the board, timer, and checks for
  this puzzle.
- **Share**: copies `location.href` to the clipboard (fallback: select-text
  dialog).

### 6.6 Highlighting

Hovering/focusing a cell highlights its row and column and their clues
(not on a solved board).

### 6.7 Zoom & pan

- Zoom factor `1` = the fitted cell size (§8); range `1` to whatever makes a
  cell 64 px (at least `1`). Not persisted; every newly loaded puzzle starts
  at `1`.
- **Touch**: one finger on the grid draws (§6.3); one finger on the clues
  pans; two fingers anywhere on the board pinch-zoom (anchored at the
  midpoint between the fingers) and pan together. After a gesture, nothing
  is drawn until all fingers have lifted.
- **Buttons**: toolbar **−** / **+** zoom by ×1.25 around the centre of the
  visible board; disabled at the limits. Keyboard `-` / `+` do the same.
- The board container's height is limited to the viewport below the toolbar
  and it scrolls in both directions. Column clues stick to its top edge and
  row clues to its left edge, so the clues of the visible cells stay readable
  while panning.

### 6.8 Recent puzzles

**Recent…** in the header opens a dialog listing the stored puzzles (§7.3),
newest first. Each entry shows a thumbnail of the player's own board (never
the solution; X and unknown both render as blank paper), the size, color
count, status (Solved / In progress), elapsed time, and when it was last
played. Activating an entry navigates to its hash (a normal history entry, so
Back returns). The current puzzle is marked "Current". Each entry except the
current one has a **Delete** button that removes its stored progress.

Only puzzles with a stored record appear: unsolved puzzles without any marks
are not stored (§7.3). Records written before the `hash` field existed
(§7.1) cannot be opened and are left out of the list (they still age out of
the LRU normally).

---

## 7. Persistence (localStorage)

All keys are prefixed `picross:`. All access goes through try/catch; if storage
is unavailable the app still works, without persistence.

### 7.1 Progress record

```
picross:p:<puzzleKey>  →  JSON
{
  "v": 1,
  "hash": "p=1.10x10...",   // canonical hash body, for Recent puzzles (§6.8)
  "board": "<base64url>",   // bit-packed like §4.2, value N+1 = X
  "elapsedMs": 123456,
  "checks": 2,
  "solved": false,
  "updatedAt": 1760000000000
}
```

`hash` was added after v1 shipped; readers MUST accept records without it.
`board` packing uses `bits = ceil(log2(N + 2))`. Writes are debounced (~300 ms)
and flushed on `pagehide`/`visibilitychange:hidden`.

### 7.2 Puzzle key

`puzzleKey` = FNV-1a 64-bit hex of the canonical `p=` hash string (without
`#`). For future DB puzzles: `id:<id>`.

### 7.3 Index & LRU

```
picross:index     →  JSON [{ "k": "<puzzleKey>", "t": updatedAt }, ...]
picross:settings  →  JSON last-used generator options (§5.1) + UI prefs
```

UI prefs: `theme` (§8), `showErrors` (default `true`) and `autoX` (default
`false`) (§6.5). Missing or non-boolean values fall back to the defaults.

On every progress write, update the entry's `t`. Keep at most **50** entries;
evict the oldest (removing its `picross:p:` record). On `QuotaExceededError`,
evict the oldest 10 and retry once.

Unsolved boards with zero progress are not stored.

---

## 8. UI layout

- **Header**: app name, version, **New puzzle…** (opens the dialog),
  **Recent…** (§6.8), **Share**, **Options…**.
- **New puzzle panel** (dialog): size presets + custom W/H, color count,
  palette preset, swatch overrides, density, **Generate**.
- **Options** (dialog): theme radio buttons (Auto / Light / Dark), and
  checkboxes "Flag impossible lines" (`showErrors`) and "Auto-X finished
  lines" (`autoX`) (§6.5). Changes apply immediately and persist.
- **Toolbar**: color swatches + X tool, undo, redo, check, restart, zoom
  −/+ (§6.7), timer, "Solved" badge.
- **Board**: column clues on top (stacked bottom-aligned), row clues on the
  left (right-aligned), grid with a thicker rule every 5 cells.
- Cell size is computed to fit the viewport (min 14 px, max 40 px), then
  multiplied by the zoom factor (§6.7). If the board doesn't fit, the board
  container scrolls (the page does not), with sticky clues.
- Light/dark theme follows `prefers-color-scheme`, overridable in Options
  and persisted.
  A tiny inline script in `<head>` applies it before first paint (no light
  flash for dark users); the app keeps it in sync afterwards.
- Clue text color: the run's palette color; when contrast with the background
  is too low (WCAG < 3:1) the number is drawn on a chip of that color with
  auto black/white text. Single-color puzzles use the normal text color.
- In dark theme the grid cells stay a dimmed light "paper" (`#cfcdc7`): puzzle
  colors are fixed by the definition, and dark ones must remain visible.
- X marks: thin diagonal cross in a muted color.
- Use the scaffold's `<dialog>` helpers instead of native `alert`/`confirm`.

---

## 9. Accessibility

- The cell area is a single focusable `role="grid"` element with
  `aria-activedescendant` for the cursor. It contains only `row`s of
  `gridcell`s; the clues sit outside it as two labelled lists ("Column clues",
  "Row clues") of `listitem`s.
- Each cell has an `aria-label`, e.g. "Row 3, column 7, filled red" (single
  color: "filled"; on a solved board unknown/X read as "empty").
- Clues get `aria-label`s like "Row 3 clue: 2 red, 1 blue". A flagged line
  (§6.5) appends ", impossible" so the error isn't conveyed by color alone.
- Color names are derived from the hex value (hue/saturation/lightness
  buckets: black, gray, red, orange, amber, yellow, green, teal, blue, purple,
  pink, brown, tan, with dark/light prefixes). Colors that get the same name
  are numbered ("red 1", "red 2"). Every preset palette yields distinct names.
  Swatches use the same names.
- Everything reachable by keyboard; nothing relies on hover alone.

---

## 10. Technical design

### 10.1 Stack

- Svelte 5 + TypeScript, built with the `single-file-svelte-app` esbuild
  pipeline (no Vite).
- **TypeScript pinned to `^6`**: `svelte-check` 4.x and `svelte-preprocess`
  6.x declare `typescript: ^5 || ^6` peers; TS 7 is not supported by them yet.
- Node 24 LTS for local development and CI.

### 10.2 Module layout

```
src/
  main.ts, template.html, global.d.ts
  App.svelte            header, toolbar, dialogs (win, share, confirm), hash lifecycle
  components/
    Board.svelte        clues + grid, sizing, zoom/pan, pointer/keyboard input
    NewPuzzleDialog.svelte
    OptionsDialog.svelte  assist options (§6.5)
    RecentDialog.svelte   recent puzzles list + thumbnails (§6.8)
  lib/
    puzzle/             pure logic, no DOM/Svelte
      types.ts          PuzzleDef, Clue, constants
      clues.ts          solution → clues; board → completion hints, win check
      codec.ts          bit packing, base64url, hash encode/decode, validation
      key.ts            FNV-1a puzzle key
      solver.ts         line solver (§5.3), line feasibility (§6.5)
      generator.ts      seed + repair loop (§5.2)
      palettes.ts       presets (§5.4)
    workers/
      generate.worker.ts  worker entry
      generate.ts       spawns the inlined worker; main-thread fallback
    state/
      game.svelte.ts    Game: board, timer, undo, saves (Svelte runes)
      progress.ts       localStorage records + LRU (§7), recent list (§6.8)
      settings.ts       last-used options + theme
      history.ts        undo/redo stack
      storage.ts        safe localStorage access
    source/
      index.ts          resolvePuzzle(hash) → LoadedPuzzle (§11)
    ui/
      format.ts         time/date format, contrast, color names
      zoom.ts           zoom limits and scroll anchoring (§6.7)
  styles/global.css
scripts/                build.mjs, dev.mjs, inline-worker.mjs, serve.mjs
tests/                  e2e/ (Playwright), Node hooks for *.svelte.ts
```

Pure logic under `lib/puzzle` has **no DOM or Svelte imports** and is unit
tested.

### 10.3 Web Worker in a single file

`scripts/inline-worker.mjs` is an esbuild plugin: `import src from
'./generate.worker.ts?worker'` bundles the worker separately (IIFE) and yields
it as a string. At runtime the worker is created from a `Blob` URL (works from
`file://` too); if workers are unavailable, generation falls back to the main
thread. No extra files are emitted.

### 10.4 Build output

- Intermediate bundles go to `.build/` (gitignored), **not** `dist/`.
- `dist/` contains exactly `index.html`, so `wrangler deploy` uploads only
  that file and the release zip matches what is served.

### 10.5 Hosting (Cloudflare Workers static assets)

`wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "picross-web",
  "compatibility_date": "2026-10-14",
  "assets": { "directory": "./dist" }
}
```

No Worker script in v1 (assets-only). Hash-based routing means no SPA fallback
is needed. Served at <https://picross-web.pytrik.workers.dev>; a custom domain
MAY be added later.

### 10.6 CI/CD (`.github/workflows/deploy.yml`)

Triggered on push of tags `v*.*.*`. Actions on their current Node 24 majors (checkout v7, setup-node v7, upload-artifact v7, download-artifact v8, action-gh-release v3).

1. **build**: `npm ci` → tag must equal `v` + `package.json` version →
   `npm run check` → `npm test` → `npm run build` → Playwright e2e against
   the build (report uploaded on failure) → upload `dist/`.
2. **deploy**: `npx wrangler deploy` with secrets `CLOUDFLARE_API_TOKEN`
   (scope: "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`.
3. **release**: zip `index.html` + `LICENSE` + `README.md` as
   `picross-web-<tag>.zip` → GitHub Release with generated notes.

This workflow is the **only** deploy path; there is no local deploy script.

`.github/workflows/ci.yml` runs the same checks (minus the tag guard, deploy
and release) on every branch push and pull request, with no secrets.

### 10.7 Testing

`node --test` running `*.test.ts` directly (Node 24 type stripping). Rune
modules (`*.svelte.ts`) are compiled on the fly by a Node loader hook
(`tests/register-svelte.mjs` → `svelte-hooks.mjs`: esbuild strips types, then
`svelte/compiler` `compileModule`). Required coverage:

- codec round-trip for all color counts, and rejection of malformed input
  (bad version, sizes, palette, length, padding bits, unused colors).
- clue derivation incl. multi-color adjacency.
- solver: known unique puzzles solve; known ambiguous ones don't fully solve.
- generator: N random runs per color count produce valid, line-solvable,
  validated definitions.
- completion-hint logic; line feasibility.
- LRU eviction; recent list (hash stored, legacy records skipped).
- settings loading/clamping and palette overrides; color naming; date
  formatting; zoom limits and anchoring.
- `Game`: strokes + undo/redo, hints, line errors, auto-X (incl. undo),
  stroke cancel, timer (start, pause/resume, resume on load), solve, check,
  restart, loading saved progress.

End-to-end: Playwright Test (`tests/e2e/`, `npm run e2e`) against the
production `dist/index.html`, served by `scripts/serve.mjs`, using the system
Google Chrome (`channel: 'chrome'`). Desktop project plus a Pixel 7 mobile
project for tests tagged `@mobile`. Any console error fails a test. Covers
input (click, right-click, drag + axis lock, keyboard), undo/redo, reload
persistence, mistake check, solving + win dialog actions, multi-color, Back
navigation, restart, invalid links, palette validation, `file://` offline use,
screen-reader labels and grid structure, pre-paint theme, options (line
errors, auto-X), run counter, recent puzzles, zoom buttons + sticky clues,
and mobile layout/touch incl. pinch-zoom. Cells expose `data-v` (board value) for tests.

### 10.8 Versioning

Version kept in sync in `package.json`, the header UI, and the git tag
`vX.Y.Z` (per the scaffold convention).

---

## 11. Future: database puzzles (design constraints for v1)

v1 code MUST keep these doors open:

- **`PuzzleSource` abstraction**: `resolve(hash): Promise<PuzzleDef>`. v1
  implements `p=` (local decode). Later, `id=` fetches
  `GET /api/puzzles/<id>` from a Worker (same project, `main` added to
  `wrangler.jsonc`, D1 for storage) returning
  `{ id, title, width, height, palette, cells: "<base64url as §4.2>" }`.
- The palette is part of the definition, so DB puzzles carry their own colors.
- The puzzle key scheme already distinguishes `id:<id>`.
- `resolve` is async from day one, even though v1 is synchronous inside.
- Hand-made DB puzzles are not guaranteed to be unique; the win check (§3.2)
  SHOULD then fall back to "all clues satisfied". The win check is therefore
  implemented as clue satisfaction, which is equivalent for unique puzzles.
- The single-file build stays usable offline for `p=` links; `id=` links
  need the network.
