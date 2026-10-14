<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import type { LineRef } from '../lib/puzzle/hint.ts';
  import { MARK_X, UNKNOWN, type Run } from '../lib/puzzle/types.ts';
  import { clickTarget, type Game } from '../lib/state/game.svelte.ts';
  import { contrast, paletteNames, textOn } from '../lib/ui/format.ts';
  import { anchoredScroll, clampZoom, maxZoom } from '../lib/ui/zoom.ts';

  interface Props {
    game: Game;
    /** Active fill color (1..N). */
    activeColor: number;
    /** Touch/primary tool is "mark X" instead of fill. */
    xMode: boolean;
    /** Cells to flag as mistakes (SPEC §6.5). */
    wrong: Set<number>;
    /** Last hint: the forcing line and the filled cell (SPEC §6.9). */
    hint: { line: LineRef; cell: number } | null;
    /** Current page background, for clue contrast. */
    bg: string;
    /** Tint clues of impossible lines (SPEC §6.5). */
    showErrors: boolean;
    /** Zoom factor, 1 = fitted (SPEC §6.7). */
    zoom: number;
    /** Highest zoom factor for the current fit (read by the toolbar). */
    zoomLimit?: number;
  }
  let {
    game,
    activeColor,
    xMode,
    wrong,
    hint,
    bg,
    showErrors,
    zoom = $bindable(),
    zoomLimit = $bindable(1),
  }: Props = $props();

  const W = $derived(game.def.width);
  const H = $derived(game.def.height);
  const palette = $derived(game.def.palette);
  /** Spoken color names (SPEC §9); single-color puzzles just say "filled". */
  const names = $derived(paletteNames(palette));

  // --- sizing (SPEC §8) ------------------------------------------------------

  /** Clue slot size relative to a cell. */
  const CLUE = 0.72;
  let wrapEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let wrapW = $state(0);
  let viewH = $state(0);
  let top = $state(0);

  const maxRowRuns = $derived(Math.max(1, ...game.clues.rows.map((c) => c.length)));
  const maxColRuns = $derived(Math.max(1, ...game.clues.cols.map((c) => c.length)));
  /** Cell size that fits the viewport, before zooming. */
  const fitCell = $derived.by(() => {
    const byW = (wrapW - 8) / (W + maxRowRuns * CLUE);
    const byH = (viewH - top - 16) / (H + maxColRuns * CLUE);
    return Math.max(14, Math.min(40, Math.floor(Math.min(byW, byH))));
  });
  const cell = $derived(Math.round(fitCell * clampZoom(zoom, fitCell)));
  $effect(() => {
    zoomLimit = maxZoom(fitCell);
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

  // --- zoom & pan (SPEC §6.7) ------------------------------------------------

  /** Zooms so the content under (clientX, clientY) stays put. */
  function setZoom(next: number, clientX: number, clientY: number) {
    const before = cell;
    zoom = clampZoom(next, fitCell);
    flushSync();
    if (cell === before) return;
    const rect = wrapEl.getBoundingClientRect();
    const ratio = cell / before;
    wrapEl.scrollLeft = anchoredScroll(wrapEl.scrollLeft, clientX - rect.left, ratio);
    wrapEl.scrollTop = anchoredScroll(wrapEl.scrollTop, clientY - rect.top, ratio);
  }

  /** Zooms around the centre of the visible board (toolbar buttons, keys). */
  export function zoomBy(factor: number) {
    const rect = wrapEl.getBoundingClientRect();
    setZoom(zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Sticky clue sizes, so keyboard scrolling keeps the cursor clear of them.
  let colCluesH = $state(0);
  let rowCluesW = $state(0);

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
      : runs.map((r) => (palette.length === 1 ? `${r.len}` : `${r.len} ${names[r.color - 1]}`)).join(', ');

  // --- cursor & highlighting -------------------------------------------------

  let cursor = $state(0);
  let hover = $state<number | null>(null);
  let focused = $state(false);
  // No row/column highlighting once solved: the board is just a picture then.
  const focus = $derived(game.solved ? null : (hover ?? (focused ? cursor : null)));
  const hlRow = $derived(focus === null ? -1 : Math.floor(focus / W));
  const hlCol = $derived(focus === null ? -1 : focus % W);

  const hintRow = $derived(hint?.line.axis === 'row' ? hint.line.index : -1);
  const hintCol = $derived(hint?.line.axis === 'col' ? hint.line.index : -1);

  /** Cursor cell, for the hint's nearest-line tie-break. */
  export function cursorIndex(): number {
    return cursor;
  }

  /** Moves the cursor to a cell and scrolls it into view. */
  export function moveCursor(index: number) {
    cursor = index;
    hover = null;
    scrollToCursor();
  }

  function scrollToCursor() {
    document.getElementById(`cell-${cursor}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function cellLabel(i: number): string {
    const v = game.board[i]!;
    const state =
      v === UNKNOWN || v === MARK_X
        ? game.solved
          ? 'empty'
          : v === UNKNOWN
            ? 'unknown'
            : 'marked empty'
        : palette.length === 1
          ? 'filled'
          : `filled ${names[v - 1]}`;
    return `Row ${Math.floor(i / W) + 1}, column ${(i % W) + 1}, ${state}`;
  }

  const lineError = (errors: boolean[], i: number) => showErrors && !game.solved && errors[i]!;

  // --- pointer input (SPEC §6.3, §6.7) ----------------------------------------

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

  /** Run counter badge (SPEC §6.3). */
  let counter = $state<{ n: number; x: number; y: number } | null>(null);

  /** Active touch points, for pinch/pan. */
  const touches = new Map<number, { x: number; y: number }>();
  /** Two-finger gesture; stays set until every finger has lifted. */
  let gesture: { dist: number; zoom: number; x: number; y: number } | null = null;
  /** One finger panning from the clue area. */
  let pan: { pointerId: number; x: number; y: number } | null = null;

  function touchSpan() {
    const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function cellAt(e: PointerEvent, clampToGrid: boolean): [number, number] | null {
    // When scrolled, the sticky clues cover some cells: only the grid itself
    // counts as a hit, except while dragging (clamped).
    if (!clampToGrid && !gridEl.contains(e.target as Node)) return null;
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
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        // A second finger turns any drawing or panning into a pinch/pan.
        if (drag) {
          game.cancelStroke();
          drag = null;
          counter = null;
        }
        pan = null;
        const span = touchSpan();
        gesture = { dist: span.dist, zoom, x: span.x, y: span.y };
        wrapEl.setPointerCapture(e.pointerId);
        return;
      }
      if (gesture) return;
    }
    if ((e.button !== 0 && e.button !== 2) || drag) return;
    const pos = cellAt(e, false);
    if (!pos) {
      if (e.pointerType === 'touch') {
        pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        wrapEl.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (game.solved) return;
    e.preventDefault();
    gridEl.focus({ preventScroll: true });
    wrapEl.setPointerCapture(e.pointerId);
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
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture) {
      if (touches.size < 2) return;
      const span = touchSpan();
      setZoom((gesture.zoom * span.dist) / gesture.dist, span.x, span.y);
      wrapEl.scrollLeft -= span.x - gesture.x;
      wrapEl.scrollTop -= span.y - gesture.y;
      gesture.x = span.x;
      gesture.y = span.y;
      return;
    }
    if (pan) {
      if (e.pointerId !== pan.pointerId) return;
      wrapEl.scrollLeft -= e.clientX - pan.x;
      wrapEl.scrollTop -= e.clientY - pan.y;
      pan.x = e.clientX;
      pan.y = e.clientY;
      return;
    }
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
    const n = Math.abs(to - from) + 1;
    counter = n >= 2 ? { n, x: e.clientX, y: e.clientY } : null;
    cursor = r * W + c;
    hover = e.pointerType === 'mouse' ? cursor : null;
  }

  function onPointerUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (gesture) {
      if (touches.size === 0) gesture = null;
      return;
    }
    if (pan?.pointerId === e.pointerId) pan = null;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    counter = null;
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
      scrollToCursor();
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

<!-- Pointer input is handled on the scroll container so touches on the clues
     can pan (SPEC §6.7); keyboard input lives on the focusable grid. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wrap"
  bind:this={wrapEl}
  bind:clientWidth={wrapW}
  style:max-height="{Math.max(160, viewH - top - 8)}px"
  style:scroll-padding-top="{colCluesH + 2}px"
  style:scroll-padding-left="{rowCluesW + 2}px"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={() => (hover = null)}
>
  <div
    class="board"
    class:solved={game.solved}
    style:--cell="{cell}px"
    style:--clue="{Math.round(cell * CLUE)}px"
    style:--font="{Math.max(9, Math.round(cell * 0.5))}px"
  >
    <div class="top">
      <div class="corner" style:width="{rowCluesW}px"></div>

      <div
        class="col-clues"
        role="list"
        aria-label="Column clues"
        bind:offsetHeight={colCluesH}
        style:grid-template-columns="repeat({W}, var(--cell))"
      >
        {#each game.clues.cols as runs, c (c)}
          {@const done = game.colHints[c]!}
          {@const err = lineError(game.colErrors, c)}
          <div
            class="col-clue"
            role="listitem"
            class:hl={c === hlCol}
            class:hint={c === hintCol}
            class:err
            aria-label="Column {c + 1} clue: {describeClue(runs)}{err ? ', impossible' : ''}"
          >
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
    </div>

    <div class="body">
      <div
        class="row-clues"
        role="list"
        aria-label="Row clues"
        bind:offsetWidth={rowCluesW}
        style:grid-template-rows="repeat({H}, var(--cell))"
      >
        {#each game.clues.rows as runs, r (r)}
          {@const done = game.rowHints[r]!}
          {@const err = lineError(game.rowErrors, r)}
          <div
            class="row-clue"
            role="listitem"
            class:hl={r === hlRow}
            class:hint={r === hintRow}
            class:err
            aria-label="Row {r + 1} clue: {describeClue(runs)}{err ? ', impossible' : ''}"
          >
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

      <!-- Only the cells are the ARIA grid: rows of gridcells, nothing else. -->
      <div
        class="grid"
        bind:this={gridEl}
        style:grid-template-columns="repeat({W}, var(--cell))"
        role="grid"
        aria-label="Picross board, {W} by {H}{game.solved ? ', solved' : ''}"
        aria-rowcount={H}
        aria-colcount={W}
        aria-activedescendant="cell-{cursor}"
        tabindex="0"
        onkeydown={onKeyDown}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
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
                class:hint-line={r === hintRow || c === hintCol}
                class:hint-cell={hint?.cell === i}
                class:cursor={focused && i === cursor && hover === null}
                style:background={filled ? palette[v - 1] : undefined}
                aria-label={cellLabel(i)}
                data-v={v}
              ></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

{#if counter}
  <div class="counter" aria-hidden="true" style:left="{counter.x}px" style:top="{counter.y}px">{counter.n}</div>
{/if}

<style>
  .wrap {
    width: 100%;
    overflow: auto;
    display: flex;
    justify-content: safe center;
    align-items: safe flex-start;
    /* No padding here: sticky clues stop at the content edge, so cells would
       show through a padding strip. The board carries the spacing instead. */
    padding: 0;
    /* Touch drawing, panning and pinching are handled in script (SPEC §6.7). */
    touch-action: none;
  }

  .board {
    width: max-content;
    padding: 4px;
    user-select: none;
    -webkit-user-select: none;
    font-size: var(--font);
    font-variant-numeric: tabular-nums;
  }

  /* Clues stay visible while a zoomed board scrolls under them (SPEC §6.7).
     Sticky elements can't leave their containing block, so the clue bars are
     whole rows of the board rather than grid items. */
  .top,
  .body {
    display: flex;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 4;
  }

  .corner,
  .row-clues {
    position: sticky;
    left: 0;
    flex-shrink: 0;
  }

  .corner {
    z-index: 1;
    background: var(--bg);
  }

  .row-clues {
    z-index: 3;
  }

  .col-clues,
  .row-clues {
    display: grid;
    background: var(--bg);
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

  .col-clue.err,
  .row-clue.err {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    box-shadow: inset 0 0 0 2px var(--danger);
  }

  .col-clue.hint,
  .row-clue.hint {
    box-shadow: inset 0 0 0 2px var(--accent);
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
    outline: none; /* the cursor cell shows focus instead */
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

  .cell.hint-line {
    background-image: linear-gradient(color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 22%, transparent));
  }

  .cell.hint-cell {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
    z-index: 2;
    animation: pulse 0.5s ease-in-out 4 alternate;
  }

  @keyframes pulse {
    to {
      outline-color: transparent;
    }
  }

  .counter {
    position: fixed;
    transform: translate(-50%, calc(-100% - 28px));
    pointer-events: none;
    z-index: 30;
    min-width: 2rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--fg);
    color: var(--bg);
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .board.solved .grid {
    cursor: default;
  }

  .board.solved .cell {
    border-color: transparent;
  }
</style>
