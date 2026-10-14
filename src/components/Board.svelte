<script lang="ts">
  import { onMount } from 'svelte';
  import { MARK_X, UNKNOWN, type Run } from '../lib/puzzle/types.ts';
  import { clickTarget, type Game } from '../lib/state/game.svelte.ts';
  import { colorLabel, contrast, textOn } from '../lib/ui/format.ts';

  interface Props {
    game: Game;
    /** Active fill color (1..N). */
    activeColor: number;
    /** Touch/primary tool is "mark X" instead of fill. */
    xMode: boolean;
    /** Cells to flag as mistakes (SPEC §6.5). */
    wrong: Set<number>;
    /** Current page background, for clue contrast. */
    bg: string;
  }
  let { game, activeColor, xMode, wrong, bg }: Props = $props();

  const W = $derived(game.def.width);
  const H = $derived(game.def.height);
  const palette = $derived(game.def.palette);

  // --- sizing (SPEC §8) ------------------------------------------------------

  /** Clue slot size relative to a cell. */
  const CLUE = 0.72;
  let wrapEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let boardEl: HTMLDivElement;
  let wrapW = $state(0);
  let viewH = $state(0);
  let top = $state(0);

  const maxRowRuns = $derived(Math.max(1, ...game.clues.rows.map((c) => c.length)));
  const maxColRuns = $derived(Math.max(1, ...game.clues.cols.map((c) => c.length)));
  const cell = $derived.by(() => {
    const byW = (wrapW - 8) / (W + maxRowRuns * CLUE);
    const byH = (viewH - top - 16) / (H + maxColRuns * CLUE);
    return Math.max(14, Math.min(40, Math.floor(Math.min(byW, byH))));
  });

  function measure() {
    viewH = window.innerHeight;
    top = wrapEl.getBoundingClientRect().top + window.scrollY;
  }
  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  // --- clues -----------------------------------------------------------------

  function clueStyle(run: Run): string {
    if (palette.length === 1) return '';
    const color = palette[run.color - 1]!;
    if (contrast(color, bg) >= 3) return `color: ${color}`;
    return `background: ${color}; color: ${textOn(color)}`;
  }

  const describeClue = (runs: Run[]) =>
    runs.length === 0
      ? '0'
      : runs.map((r) => (palette.length === 1 ? `${r.len}` : `${r.len} ${colorLabel(r.color)}`)).join(', ');

  // --- cursor & highlighting -------------------------------------------------

  let cursor = $state(0);
  let hover = $state<number | null>(null);
  let focused = $state(false);
  const focus = $derived(hover ?? (focused ? cursor : null));
  const hlRow = $derived(focus === null ? -1 : Math.floor(focus / W));
  const hlCol = $derived(focus === null ? -1 : focus % W);

  function cellLabel(i: number): string {
    const v = game.board[i]!;
    const state = v === UNKNOWN ? 'unknown' : v === MARK_X ? 'marked empty' : palette.length === 1 ? 'filled' : `filled ${colorLabel(v)}`;
    return `Row ${Math.floor(i / W) + 1}, column ${(i % W) + 1}, ${state}`;
  }

  // --- pointer input (SPEC §6.3) ---------------------------------------------

  interface Drag {
    pointerId: number;
    r0: number;
    c0: number;
    /** State of the first cell before the stroke; only such cells change. */
    orig: number;
    target: number;
    axis: 'row' | 'col' | null;
  }
  let drag: Drag | null = null;

  function cellAt(e: PointerEvent, clampToGrid: boolean): [number, number] | null {
    const rect = gridEl.getBoundingClientRect();
    let c = Math.floor((e.clientX - rect.left) / cell);
    let r = Math.floor((e.clientY - rect.top) / cell);
    if (!clampToGrid && (c < 0 || r < 0 || c >= W || r >= H)) return null;
    c = Math.min(W - 1, Math.max(0, c));
    r = Math.min(H - 1, Math.max(0, r));
    return [r, c];
  }

  function applyTo(index: number, orig: number, target: number) {
    if (game.board[index] === orig) game.setCell(index, target);
  }

  function onPointerDown(e: PointerEvent) {
    if (game.solved || (e.button !== 0 && e.button !== 2) || drag) return;
    const pos = cellAt(e, false);
    if (!pos) return;
    e.preventDefault();
    boardEl.focus({ preventScroll: true });
    gridEl.setPointerCapture(e.pointerId);
    const [r, c] = pos;
    const index = r * W + c;
    const tool = e.button === 2 || xMode ? MARK_X : activeColor;
    const orig = game.board[index]!;
    drag = { pointerId: e.pointerId, r0: r, c0: c, orig, target: clickTarget(orig, tool), axis: null };
    cursor = index;
    game.beginStroke();
    applyTo(index, orig, drag.target);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) {
      const pos = e.pointerType === 'mouse' ? cellAt(e, false) : null;
      hover = pos ? pos[0] * W + pos[1] : null;
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    let [r, c] = cellAt(e, true)!;
    if (drag.axis === null) {
      if (r === drag.r0 && c === drag.c0) return;
      drag.axis = Math.abs(c - drag.c0) >= Math.abs(r - drag.r0) ? 'row' : 'col';
    }
    if (drag.axis === 'row') r = drag.r0;
    else c = drag.c0;
    // Fill the whole span so fast moves don't skip cells.
    const [from, to] = drag.axis === 'row' ? [drag.c0, c] : [drag.r0, r];
    for (let k = Math.min(from, to); k <= Math.max(from, to); k++) {
      applyTo(drag.axis === 'row' ? r * W + k : k * W + c, drag.orig, drag.target);
    }
    cursor = r * W + c;
    hover = e.pointerType === 'mouse' ? cursor : null;
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    game.endStroke();
  }

  // --- keyboard (SPEC §6.4) --------------------------------------------------

  let lastKey: { orig: number; target: number } | null = null;

  function keyStroke(index: number, orig: number, target: number) {
    game.beginStroke();
    applyTo(index, orig, target);
    game.endStroke();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      hover = null;
      const r = Math.min(H - 1, Math.max(0, Math.floor(cursor / W) + move[0]));
      const c = Math.min(W - 1, Math.max(0, (cursor % W) + move[1]));
      cursor = r * W + c;
      if (e.shiftKey && lastKey && !game.solved) keyStroke(cursor, lastKey.orig, lastKey.target);
      return;
    }
    if (game.solved) return;
    let tool: number | null = null;
    if (e.key === ' ' || e.key === 'Enter') tool = xMode ? MARK_X : activeColor;
    else if (e.key === 'x' || e.key === 'X') tool = MARK_X;
    if (tool !== null) {
      e.preventDefault();
      const orig = game.board[cursor]!;
      lastKey = { orig, target: clickTarget(orig, tool) };
      keyStroke(cursor, orig, lastKey.target);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const orig = game.board[cursor]!;
      lastKey = { orig, target: UNKNOWN };
      keyStroke(cursor, orig, UNKNOWN);
    }
  }
</script>

<div class="wrap" bind:this={wrapEl} bind:clientWidth={wrapW}>
  <div
    class="board"
    class:solved={game.solved}
    style:--cell="{cell}px"
    style:--clue="{Math.round(cell * CLUE)}px"
    style:--font="{Math.max(9, Math.round(cell * 0.5))}px"
    style:grid-template-columns="auto {W * cell}px"
    bind:this={boardEl}
    role="grid"
    aria-label="Picross board, {W} by {H}"
    aria-rowcount={H}
    aria-colcount={W}
    aria-activedescendant="cell-{cursor}"
    tabindex="0"
    onkeydown={onKeyDown}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
  >
    <div class="corner"></div>

    <div class="col-clues" style:grid-template-columns="repeat({W}, var(--cell))">
      {#each game.clues.cols as runs, c (c)}
        {@const done = game.colHints[c]!}
        <div class="col-clue" class:hl={c === hlCol} aria-label="Column {c + 1} clue: {describeClue(runs)}">
          {#each runs as run, k (k)}
            <span class="num" class:done={done[k]} class:chip={clueStyle(run).startsWith('background')} style={clueStyle(run)}>
              {run.len}
            </span>
          {:else}
            <span class="num zero">0</span>
          {/each}
        </div>
      {/each}
    </div>

    <div class="row-clues" style:grid-template-rows="repeat({H}, var(--cell))">
      {#each game.clues.rows as runs, r (r)}
        {@const done = game.rowHints[r]!}
        <div class="row-clue" class:hl={r === hlRow} aria-label="Row {r + 1} clue: {describeClue(runs)}">
          {#each runs as run, k (k)}
            <span class="num" class:done={done[k]} class:chip={clueStyle(run).startsWith('background')} style={clueStyle(run)}>
              {run.len}
            </span>
          {:else}
            <span class="num zero">0</span>
          {/each}
        </div>
      {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="grid"
      bind:this={gridEl}
      style:grid-template-columns="repeat({W}, var(--cell))"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onpointerleave={() => (hover = null)}
      oncontextmenu={(e) => e.preventDefault()}
    >
      {#each { length: H } as _, r (r)}
        <div class="row" role="row">
          {#each { length: W } as _, c (c)}
            {@const i = r * W + c}
            {@const v = game.board[i]!}
            {@const filled = v !== UNKNOWN && v !== MARK_X}
            <div
              id="cell-{i}"
              role="gridcell"
              class="cell"
              class:x={v === MARK_X && !game.solved}
              class:hl={!filled && (r === hlRow || c === hlCol)}
              class:t5r={(c + 1) % 5 === 0 && c < W - 1}
              class:t5b={(r + 1) % 5 === 0 && r < H - 1}
              class:wrong={wrong.has(i)}
              class:cursor={focused && i === cursor && hover === null}
              style:background={filled ? palette[v - 1] : undefined}
              aria-label={cellLabel(i)}
            ></div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .wrap {
    width: 100%;
    overflow: auto;
    display: flex;
    justify-content: safe center;
    padding: 4px;
  }

  .board {
    display: grid;
    width: max-content;
    outline: none;
    user-select: none;
    -webkit-user-select: none;
    font-size: var(--font);
    font-variant-numeric: tabular-nums;
  }

  .col-clues,
  .row-clues {
    display: grid;
  }

  .col-clue {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 3px;
    border-radius: 4px 4px 0 0;
  }

  .row-clue {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding-right: 4px;
    border-radius: 4px 0 0 4px;
  }

  .col-clue.hl,
  .row-clue.hl {
    background: var(--hl);
  }

  .num {
    min-width: var(--clue);
    min-height: var(--clue);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    line-height: 1;
    transition: opacity 0.15s;
  }

  .num.chip {
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 25%, transparent);
    margin: 1px;
    min-width: calc(var(--clue) - 2px);
    min-height: calc(var(--clue) - 2px);
  }

  .num.done {
    opacity: 0.3;
  }

  .num.zero {
    opacity: 0.35;
  }

  .grid {
    display: grid;
    touch-action: none;
    border: 2px solid var(--grid-strong);
    box-sizing: content-box;
    cursor: pointer;
  }

  .row {
    display: contents;
  }

  .cell {
    width: var(--cell);
    height: var(--cell);
    box-sizing: border-box;
    border-right: 1px solid var(--grid-line);
    border-bottom: 1px solid var(--grid-line);
    background: var(--cell-bg);
    position: relative;
  }

  .cell.hl {
    background: linear-gradient(var(--hl), var(--hl)), var(--cell-bg);
  }

  .cell.t5r {
    border-right: 2px solid var(--grid-strong);
  }

  .cell.t5b {
    border-bottom: 2px solid var(--grid-strong);
  }

  .cell.x::before,
  .cell.x::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 55%;
    height: 1.5px;
    background: var(--x);
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .cell.x::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }

  .cell.cursor {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    z-index: 1;
  }

  .cell.wrong {
    outline: 3px solid var(--danger);
    outline-offset: -3px;
    z-index: 2;
    animation: pulse 0.5s ease-in-out 4 alternate;
  }

  @keyframes pulse {
    to {
      outline-color: transparent;
    }
  }

  .board.solved .grid {
    cursor: default;
  }

  .board.solved .cell {
    border-color: transparent;
  }
</style>
