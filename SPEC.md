# Picross Web — Specification

Status: **v1 in progress**: 0.5.0 is live at
<https://picross-web.pytrik.workers.dev>; the puzzle editor and database
puzzles (§1.3) are still to do. v1 is finished when §1.4 is met, and ships as
**1.0.0**.
This document is the source of truth for behaviour. When the code and this spec disagree, one of them is a bug.

Keywords **MUST**, **SHOULD**, **MAY** are used in the RFC 2119 sense.

"v1" in this document is the product release 1.0.0. It is unrelated to the
hash format version (`p=1.`, §4.2) and the progress record version (`"v": 1`,
§7.1), which stay at 1 for all of v1.

---

## 1. Scope

### 1.1 v1

Implemented (0.5.0):

- Randomly generated, multi-color nonogram ("picross") puzzles.
- Every generated puzzle has a **unique solution reachable by line logic alone**
  (no guessing).
- Puzzle definition lives in the URL hash → reload- and share-safe.
- Player progress lives in `localStorage` → survives reloads.
- Shipped as **one self-contained `index.html`** (no external requests), hosted
  on Cloudflare Workers static assets.
- Assists (§6.5), zoom & pan (§6.7), recent puzzles (§6.8), options and themes
  (§8).
- Hint (§6.9), difficulty rating with a target difficulty (§5.5), and
  picture-like grid styles (§5.6), added in 0.5.0.

Still to do: the puzzle editor and database puzzles (§1.3). With those,
everything except database puzzles keeps working offline from the single
file; database puzzles and the Library need the network (§11).

### 1.2 Out of scope for v1

- Accounts, user profiles, leaderboards, and cloud sync of progress. Progress
  stays in the browser (§7).
- Player-published puzzles: there is no write API. Database puzzles are curated
  by the maintainer in the repository (§1.3), and the editor shares `p=` links
  only. So no moderation, reporting, comments, or ratings either.
- Other ideas considered and not chosen for v1 (MAY be revisited after 1.0.0):
  daily puzzle, statistics, export/import of progress, solved-picture export,
  "beat my time" links, installable PWA / service worker (it would break the
  single-file build), haptics, win animation, and a fill-only-unknown drag
  modifier.

### 1.3 v1 features

Each feature gets its own spec section before work starts. That section fills
in the design; the requirements below are fixed. Every feature MUST be covered
by unit and e2e tests (§10.7) and documented in README.md.

Done in 0.5.0: Hint, difficulty rating, picture-like grids (their
requirements are kept below for reference). To do: puzzle editor, database
puzzles.

**Hint** (done: §6.9)

- A **Hint** toolbar button (and a key) fills in one still-unknown cell whose
  value line logic forces from the current marks (§5.3), with its value (color
  or X), and highlights the line that forces it. The hint is one undo step.
- Hints MUST NOT deduce from wrong marks: if the board contradicts the
  solution, the hint reports that instead (pointing out at least one wrong
  cell) and makes no change.
- If line logic can't determine any further cell (only possible for a
  non-line-solvable puzzle), the hint says so.
- Hints used are counted, persisted with the progress (§7.1), and shown on
  win next to checks. Disabled on a solved board.

**Difficulty rating** (done: §5.5)

- Every puzzle gets a rating (Easy / Medium / Hard) computed deterministically
  from its definition by measuring line-solver effort; the metric and
  thresholds are defined in the feature's section. A puzzle that line logic
  can't fully solve shows as "Unrated".
- The rating is derived, never stored in the hash, so a shared link shows the
  same rating everywhere. It is shown in the toolbar, the win dialog, Recent
  puzzles (§6.8) and the Library.
- The New puzzle dialog gets a target difficulty (Any / Easy / Medium / Hard,
  default Any) that the generator meets, within the 10 s budget (§5.2) at the
  worst case. On timeout the existing error + **Retry** applies.

**Picture-like grids** (done: §5.6)

- The New puzzle dialog gets a style option: Random (today's behaviour,
  default), Symmetric (mirror symmetry), and Smooth (fewer isolated cells,
  more blob-like shapes).
- Every style MUST keep all generator guarantees (§5.2): unique, line-solvable,
  every color used, roughly the chosen density, and the 10 s budget at the
  worst case. If repairs must break the style, uniqueness wins.

**Puzzle editor** (to do)

- **Editor…** opens a mode for drawing a puzzle: size 5–30 × 5–30, 1–6 colors
  with the same palette presets and overrides as §5.4, and the same drawing
  input as play (§6.1–§6.4, incl. undo/redo, drag, zoom).
- Clues update live as the grid is drawn.
- **Check** runs the line solver (§5.3) and shows whether the puzzle is
  line-solvable; if not, it highlights the cells line logic can't determine.
- **Play** / **Share** produce a `p=` link, but only for a puzzle that passes
  validation (§4.1) **and** is line-solvable, so every `p=` puzzle the app
  produces keeps the §1.1 guarantee.
- One unfinished draft is kept in `localStorage`. The editor works offline.

**Database puzzles** (to do)

- Curated puzzles live in the repository (format defined in §11), each with an
  id and a title. CI MUST validate every one (§4.1) and require it to be
  line-solvable. The deploy workflow (§10.6) loads them into D1; nothing else
  writes to the database.
- A Worker in the same project serves a **read-only** API: a list of puzzles
  (id, title, size, colors, rating) and a single puzzle by id (§11). Static
  assets are still the single `index.html`.
- `#id=<id>` links open a database puzzle (§4.3, §11) and show its title.
  Progress is stored under `id:<id>` (§7.2). Recent puzzles (§6.8) lists them
  too, so their definitions are cached locally.
- A **Library…** dialog lists the database puzzles with title, size, colors,
  rating, and the player's local status (not started / in progress / solved).
- Offline, or when the API fails, `id=` links and the Library show a clear
  notice; nothing else is affected.
- Launch with a starter set of at least 10 curated puzzles.

### 1.4 Definition of done for v1 (1.0.0)

v1 is finished, and 1.0.0 is tagged, when all of these hold:

1. Every feature in §1.3 is implemented and specified in its own section of
   this document, and README.md describes it.
2. `npm run check`, `npm test` and `npm run e2e` pass in CI, and each new e2e
   test passes `--repeat-each 5` locally.
3. The generator stays within its 10 s budget at the worst case: 30×30,
   density 0.40, every color count (1 color is the slowest), for every style
   and difficulty target.
4. Compatibility: every `p=` link and every stored progress record created by
   0.x still opens, with its progress.
5. Offline: the release `index.html` opened from `file://` works for
   everything except database puzzles and the Library, which show the offline
   notice.
6. Accessibility (§9) covers all new UI: keyboard reachable, labelled, nothing
   conveyed by color alone.
7. The database holds the curated starter set, served by the Worker, and
   deployed only from GitHub Actions.
8. This status line reads "v1, complete", and `package.json` is at 1.0.0.

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
| **Rating** | A puzzle's difficulty (Easy / Medium / Hard / Unrated), derived from its definition (§5.5). |
| **Target difficulty** | The difficulty asked for in the New puzzle dialog, or Any (§5.5). |
| **Style** | How the generator shapes a grid: Random, Symmetric or Smooth (§5.6). |
| **Hint** | The toolbar action that fills in one deducible cell (§6.9). Not to be confused with clue dimming (§6.5). |
| **Clue dimming** | Fading clue runs the marks already complete (§6.5). |

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
- A dialog shows: size, colors, difficulty (§5.5), elapsed time, number of
  mistake checks used, number of hints used (§6.9), and three actions:
  - **Close**: dismiss, keep looking at the solved board.
  - **New puzzle…**: opens the same settings dialog as the header button.
  - **Play another**: immediately generates a new puzzle with the solved
    puzzle's size, palette and difficulty as target (which may differ from
    the saved settings when the puzzle came from a shared link). An unrated
    puzzle uses target Any with the saved density (density is not part of a
    definition). The style is the saved one (§5.6; style isn't part of a
    definition either). Saved settings are not changed.
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
  // Database puzzles only (§11); never encoded in `p=` hashes.
  id?: string;
  title?: string;
}
```

Validation (applies to hash decode and every other source, incl. §11):

- `width`, `height` integers in `[5, 30]`.
- `palette.length` in `[1, 6]`, each matching `/^#[0-9a-f]{6}$/`, no duplicates.
- Every cell value `<= palette.length`.
- Every palette color MUST be used at least once (otherwise the palette is
  misleading).
- Grid MUST contain at least one filled cell.

Invalid definitions are rejected (§4.4).

### 4.2 Hash format (format version 1)

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
| Fill density | 0.40–0.75 (only with difficulty Any) | 0.58 |
| Difficulty | Any, Easy, Medium, Hard (§5.5) | Any |
| Style | Random, Symmetric, Smooth (§5.6) | Random |

Last-used options persist (§7.3).

### 5.2 Algorithm

1. **Seed grid.** Each cell is filled with probability `density` (shaped by
   the style, §5.6). Filled cells get a color. For `N > 1`, colors SHOULD be
   spatially coherent rather than per-cell noise: pick `N` distinct random
   *filled* cells as seed points and assign each filled cell the color of its
   nearest seed (Voronoi). Seeding at filled cells means every color starts
   with at least one cell. A finished grid that does not use every color is
   discarded and generation restarts from step 1.
2. **Line-solve** (§5.3) from an empty board using only clues.
3. If fully solved → done (the result is unique and needs no guessing).
4. Otherwise **repair**: pick a cell the solver left undetermined (at random,
   or as the style prefers), flip it in the solution (empty↔filled; for
   filled cells pick a color per rule 1), together with its mirror images for
   Symmetric, re-validate, and go to step 2. Repeat up to `maxRepairs = W*H`.
5. If repairs run out, restart from step 1. Give up after a time budget
   (default 10 s) and show an error with a **Retry** button.
6. With a target difficulty (§5.5), each attempt draws its seed density from
   the target's band instead of the slider, and a puzzle whose rating isn't
   the target is discarded (restart from step 1, same time budget).
7. The style (§5.6) is best effort: after a third of the time budget without
   a result, the remaining attempts use Random.

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

The same solver is reused by tests, line errors (§6.5), the hint (§6.9), the
difficulty rating (§5.5), and the planned editor (§1.3).

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
(the generate button is disabled with a message).

### 5.5 Difficulty rating

Every puzzle is rated **Easy**, **Medium**, **Hard** or **Unrated**,
computed from its definition alone (`lib/puzzle/rating.ts`), so a shared link
shows the same rating everywhere. It is never stored, not in the hash and not
in progress records.

**Metric.** Line-solve from an empty board in *rounds*: each round solves
every line against the same snapshot of knowledge (as if all lines were
worked on in parallel), then applies all narrowings together. `rounds` is the
number of rounds that change something until every cell is determined; it
measures the length of the chain of deductions, independent of line order.
If line logic gets stuck, the puzzle is **Unrated**. Otherwise
`effort = rounds / (W + H)`:

| Effort | Rating |
|---|---|
| < 0.20 | Easy |
| 0.20 – < 0.30 | Medium |
| ≥ 0.30 | Hard |

**Area cap.** Small boards can't be hard in a meaningful way, and the
generator can't reliably reach those ratings there. Medium needs an area
`W × H ≥ 75`, Hard `≥ 150`. A puzzle rated above what its area allows is
shown at the highest level allowed (so a 5×5 is always Easy).

**Target difficulty** (New puzzle dialog, default Any). Difficulty depends
almost entirely on fill density, so a target sets the density instead of
filtering it. Any uses the density slider as before. Easy / Medium / Hard
disable the slider (showing the band instead) and each attempt draws its seed
density uniformly from:

| Target | Density band |
|---|---|
| Easy | 0.68 – 0.75 |
| Medium | 0.52 – 0.62 |
| Hard | 0.40 – 0.48 |

then regenerates until the rating matches (§5.2 step 6). Targets that the
area cap forbids stay selectable but are marked ("Needs a board of at least
N cells"); while one is selected, an error explains it and **Generate** is
disabled.

The thresholds and bands come from sampling generated puzzles for sizes 5×5
to 30×30, 1–6 colors and the full density range; with them every allowed
target is met in well under a second, also for thin boards like 5×30 (the
slowest case remains Any at density 0.40 with 1 color, ~2–5 s at 30×30).

The rating is shown in the toolbar, the win dialog and Recent puzzles (§6.8).
Rating a 30×30 takes ~10 ms, so Recent fills ratings in after the list
appears, one entry per task, cached for the session.

### 5.6 Grid styles

The New puzzle dialog picks a style (default Random); it is saved with the
other options (§7.3) and used by **Play another**. Style only shapes the seed
grid and the repairs (§5.2 steps 1 and 4). Uniqueness, line-solvability,
every color used, the density, the target difficulty and the time budget
always hold. Implemented in `lib/puzzle/styles.ts`.

- **Random**: each cell filled with probability `density` (the original
  behaviour).
- **Symmetric**: each attempt picks a mirror at random: left-right,
  top-bottom, or both. A cell and its mirror images (its *orbit*) always
  hold the same value: the seed fills whole orbits, the Voronoi color seeds
  lie in the part every orbit starts in (so mirrored cells share a color),
  and a repair flips the whole orbit.
- **Smooth**: blob-like shapes with few isolated cells. Noise at `density`
  gets two majority passes (a cell becomes filled if most of its 3×3 window
  is, ties unchanged), then is grown at the blob edges (empty cells with the
  most filled neighbours first) or shrunk (filled cells with the fewest) back
  to exactly `density`. Repairs prefer *smoothing* flips: a filled cell with
  mostly empty 4-neighbours, or an empty cell with mostly filled ones.
  Measured: under 1% of filled cells isolated (no filled 4-neighbour) vs.
  about 10% for Random.

**Fallback.** Blob shapes have long runs and large overlaps, so Smooth
puzzles rate Easy far more often than Random ones. Smooth + Hard is rare on
large boards with many colors and practically never happens on thin boards
(e.g. 0 in 100 at 5×30 with 6 colors). Rather than give up, generation
switches to Random after a third of the time budget (§5.2 step 7), so
"uniqueness wins" also covers difficulty. When that happens the app says so:
"Couldn't keep the Smooth style at this size and difficulty; this puzzle is
Random."

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
| `H` | Hint (§6.9) |
| Ctrl/Cmd+Z, Ctrl+Y / Ctrl/Cmd+Shift+Z | Undo / redo |

Moving the cursor scrolls it into view when the board is zoomed, clear of the
sticky clues.

### 6.5 Assists

- **Undo/redo**: unlimited within the session, per puzzle, in memory only
  (lost on reload; the board itself is not). Toolbar buttons + shortcuts.
- **Clue dimming**: computed from the board alone (never from the
  solution, so it can't spoil anything):
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
- **Restart**: (with confirm dialog) clears the board, timer, checks and
  hints (§6.9) for this puzzle.
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
count, difficulty (§5.5), status (Solved / In progress), elapsed time, and
when it was last played. Activating an entry navigates to its hash (a normal history entry, so
Back returns). The current puzzle is marked "Current". Each entry except the
current one has a **Delete** button that removes its stored progress.

Only puzzles with a stored record appear: unsolved puzzles without any marks
are not stored (§7.3). Records written before the `hash` field existed
(§7.1) cannot be opened and are left out of the list (they still age out of
the LRU normally).

### 6.9 Hint

**Hint** in the toolbar (key `H`) asks the line solver (§5.3) for the next
step. Disabled on a solved board. Implemented in `lib/puzzle/hint.ts`.

1. **Wrong marks first.** If any mark contradicts the solution (the same test
   as the mistake check, §6.5), nothing is deduced: the wrong cells are
   highlighted for 2 s exactly like a check, the message "Fix the highlighted
   mistake first." (or "Fix the N highlighted mistakes first.") is shown, and
   the board is unchanged. This counts as
   neither a hint nor a check.
2. **Knowledge from the marks.** Each cell starts as: unknown → every state,
   X → empty, filled → its color.
3. **Pick a line.** Every row and column is solved against that knowledge.
   Among the lines that force at least one *unknown* cell to a single state,
   take the one forcing the most such cells (the most obvious deduction); ties
   go to the line nearest the board cursor (row distance for rows, column
   distance for columns). Within it, the forced cell nearest the cursor is
   chosen.
4. **Partial facts.** With several colors, line logic also learns facts the
   board can't show ("this cell is not red"), so the marks alone may force
   nothing even on a line-solvable puzzle. If no line forces a cell, the
   narrowed knowledge of every line is applied at once and step 3 repeats.
   The highlighted line is then the one that makes the final deduction.
5. **Stuck.** If a round narrows nothing, line logic can't determine any
   further cell (only possible for a puzzle that isn't line-solvable): the
   message "Line logic can't determine any more cells." is shown and the
   board is unchanged.
6. **Apply.** The chosen cell gets its value (color, or X for empty) as its
   own undo step. It does not trigger auto-X (it is not a stroke), starts the
   timer like any change, and may solve the puzzle. The `hints` counter goes
   up by one (undo does not refund it). The cursor moves to the cell
   (scrolling it into view), and for 2 s the cell is outlined and the line
   and its clue are highlighted. Because the highlight is color-only, a
   status message says the same in words, e.g. "Hint: column 7 forces row 3,
   column 7 to be filled red."

`hints` is persisted (§7.1), cleared by **Restart**, and shown in the win
dialog under "Hints used".

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
  "hints": 1,               // added in 0.5.0 (§6.9); missing = 0
  "solved": false,
  "updatedAt": 1760000000000
}
```

`hash` was added in 0.4.0 and `hints` in 0.5.0; readers MUST accept records
without them.
`board` packing uses `bits = ceil(log2(N + 2))`. Writes are debounced (~300 ms)
and flushed on `pagehide`/`visibilitychange:hidden`.

### 7.2 Puzzle key

`puzzleKey` = FNV-1a 64-bit hex of the canonical `p=` hash string (without
`#`). For database puzzles (§11): `id:<id>`.

### 7.3 Index & LRU

```
picross:index     →  JSON [{ "k": "<puzzleKey>", "t": updatedAt }, ...]
picross:settings  →  JSON last-used generator options (§5.1) + UI prefs
```

Generator options include `difficulty` (`any` | `easy` | `medium` | `hard`;
anything else loads as `any`) and `style` (`random` | `symmetric` |
`smooth`; anything else loads as `random`).

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
  palette preset, swatch overrides, style (§5.6), difficulty (§5.5),
  density, **Generate**.
- **Options** (dialog): theme radio buttons (Auto / Light / Dark), and
  checkboxes "Flag impossible lines" (`showErrors`) and "Auto-X finished
  lines" (`autoX`) (§6.5). Changes apply immediately and persist.
- **Toolbar**: color swatches + X tool, undo, redo, check, hint, restart, zoom
  −/+ (§6.7), difficulty (§5.5), timer, "Solved" badge.
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
- New puzzle dialog: style and difficulty are `radiogroup`s of `radio`
  buttons. A difficulty too big for the board says why in its accessible
  name ("Hard, needs a board of at least 150 cells"), not only by fading.
- The toolbar rating reads "Difficulty: Hard" (`aria-label`).
- Hint results, mistake-check results and the style fallback are announced
  through the `role="status"` toast; the hint's line highlight is never the
  only signal (§6.9).
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
      clues.ts          solution → clues; board → clue dimming, win check
      codec.ts          bit packing, base64url, hash encode/decode, validation
      key.ts            FNV-1a puzzle key
      solver.ts         line solver (§5.3), line feasibility (§6.5)
      hint.ts           next hint, wrong cells (§6.9)
      generator.ts      seed + repair loop (§5.2), target difficulty
      rating.ts         difficulty rating, area caps, density bands (§5.5)
      styles.ts         grid styles: seeding, mirror orbits, repair choice (§5.6)
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
scripts/                build.mjs, dev.mjs, inline-worker.mjs, serve.mjs,
                        bench-generator.ts (npm run bench, §10.7)
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

No Worker script yet (assets-only); database puzzles (§1.3) add one. Hash-based routing means no SPA fallback
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
  validated definitions; every target difficulty is met, incl. at the area
  limits and on thin boards.
- rating: round count, Unrated for non-line-solvable puzzles, area caps,
  density bands.
- styles: Symmetric output is mirrored and all three modes occur; Smooth has
  at most half of Random's isolated-cell share at about the same density;
  every style meets every target (allowing the Random fallback).
- Time budget: `npm run bench` (`scripts/bench-generator.ts`, not part of
  `npm test`) generates every style × target × color count at 30×30 and 5×30,
  density 0.40, and fails on a timeout, a wrong rating or a run over 10 s.
- clue dimming logic; line feasibility.
- hint: line choice and tie-breaks, wrong marks, stuck, partial facts
  (repeated hints solve generated multi-color puzzles, always with the
  solution's value).
- LRU eviction; recent list (hash stored, legacy records skipped).
- settings loading/clamping and palette overrides; color naming; date
  formatting; zoom limits and anchoring.
- `Game`: strokes + undo/redo, clue dimming, line errors, auto-X (incl.
  undo), stroke cancel, timer (start, pause/resume, resume on load), solve,
  check, restart, loading saved progress, Hint (undo step, counting,
  persistence, legacy records without `hints`).

End-to-end: Playwright Test (`tests/e2e/`, `npm run e2e`) against the
production `dist/index.html`, served by `scripts/serve.mjs`, using the system
Google Chrome (`channel: 'chrome'`). Desktop project plus a Pixel 7 mobile
project for tests tagged `@mobile`. Any console error fails a test. Covers
input (click, right-click, drag + axis lock, keyboard), undo/redo, reload
persistence, mistake check, hint (fill + highlight + undo, wrong marks,
stuck, count on win), difficulty (area gating incl. accessible names,
density disabled, toolbar + win dialog, persisted target, Play another keeps
it, Unrated in Recent),
style (Symmetric output mirrored, choice persisted),
solving + win dialog actions, multi-color, Back
navigation, restart, invalid links, palette validation, `file://` offline use,
screen-reader labels and grid structure, pre-paint theme, options (line
errors, auto-X), run counter, recent puzzles, zoom buttons + sticky clues,
and mobile layout/touch incl. pinch-zoom. Cells expose `data-v` (board value) for tests.

### 10.8 Versioning

Version kept in sync in `package.json`, the header UI, and the git tag
`vX.Y.Z` (per the scaffold convention).

---

## 11. Database puzzles (to be specified; design constraints so far)

Requirements are in §1.3. Until this section is written in full, the code
keeps these doors open:

- **`PuzzleSource` abstraction**: `resolve(hash): Promise<PuzzleDef>`. Today
  only `p=` is implemented (local decode). `id=` will fetch
  `GET /api/puzzles/<id>` from a Worker (same project, `main` added to
  `wrangler.jsonc`, D1 for storage) returning
  `{ id, title, width, height, palette, cells: "<base64url as §4.2>" }`.
- The palette is part of the definition, so DB puzzles carry their own colors.
- The puzzle key scheme already distinguishes `id:<id>`.
- `resolve` is async from day one, even though `p=` is synchronous inside.
- Curated puzzles must be line-solvable (§1.3), hence unique. The win check
  (§3.2) is implemented as clue satisfaction anyway, which is equivalent for
  unique puzzles and safe if that ever changes.
- The single-file build stays usable offline for `p=` links; `id=` links
  need the network.
