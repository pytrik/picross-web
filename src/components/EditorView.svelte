<script lang="ts">
  // Puzzle editor (SPEC §6.10): toolbar, status line, the draft on a Board,
  // and the Grid dialog. App owns navigation, confirms and toasts.
  import { RATING_LABELS } from '../lib/puzzle/rating.ts';
  import type { PuzzleDef } from '../lib/puzzle/types.ts';
  import { erasedBy, pickGrid, type Editor, type EditorStatus } from '../lib/state/editor.svelte.ts';
  import { clampSize, DEFAULT_SETTINGS, effectivePalette, type GridSettings } from '../lib/state/settings.ts';
  import { paletteNames } from '../lib/ui/format.ts';
  import { ZOOM_STEP } from '../lib/ui/zoom.ts';
  import Board from './Board.svelte';
  import GridFields from './GridFields.svelte';

  interface Props {
    editor: Editor;
    /** Current page background, for clue contrast. */
    bg: string;
    /** A puzzle was being played, so Copy puzzle has something to copy. */
    canCopy: boolean;
    onPlay: (def: PuzzleDef) => void;
    onShare: (def: PuzzleDef) => void;
    onCopy: () => void;
    onClose: () => void;
    showToast: (message: string) => void;
  }
  let { editor, bg, canCopy, onPlay, onShare, onCopy, onClose, showToast }: Props = $props();

  let activeColor = $state(1);
  let erase = $state(false);
  const colors = $derived(editor.palette.length);
  const tool = $derived(Math.min(activeColor, colors));
  const names = $derived(paletteNames(editor.palette));

  let board = $state<ReturnType<typeof Board>>();
  let zoom = $state(1);
  let zoomLimit = $state(1);

  // --- status (SPEC §6.10) ---------------------------------------------------

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function statusText(status: EditorStatus): string {
    if (status.kind === 'empty') return 'Empty: draw a picture to play it.';
    const main =
      status.kind === 'solvable'
        ? `Line-solvable · ${RATING_LABELS[status.rating]}`
        : `Not line-solvable: ${plural(status.undetermined.length, 'cell')} undetermined.`;
    if (status.dropped.length === 0) return main;
    return `${main} Unused colors left out: ${status.dropped.map((i) => names[i - 1]).join(', ')}.`;
  }

  const ready = $derived(editor.status.kind === 'solvable' ? editor.status.def : null);
  const notReady = 'Needs a line-solvable picture (see the status line)';

  function check() {
    const status = editor.check();
    if (status.kind === 'empty') showToast('Empty: draw a picture to play it.');
    else if (status.kind === 'solvable') showToast(`Line-solvable, rated ${RATING_LABELS[status.rating]}.`);
    else {
      const n = status.undetermined.length;
      showToast(`Line logic can’t determine ${plural(n, 'cell')}; ${n === 1 ? 'it’s' : 'they’re'} highlighted.`);
    }
  }

  // --- keys (play's global keys live in App and are off while editing) ----

  function onKey(e: KeyboardEvent) {
    if (document.querySelector('dialog[open]')) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      editor.redo();
    } else if (!mod && !e.altKey && /^[1-6]$/.test(e.key) && Number(e.key) <= colors) {
      activeColor = Number(e.key);
      erase = false;
    } else if (!mod && !e.altKey && (e.key === '+' || e.key === '=' || e.key === '-')) {
      e.preventDefault();
      board?.zoomBy(e.key === '-' ? 1 / ZOOM_STEP : ZOOM_STEP);
    }
  }

  // --- Grid dialog -----------------------------------------------------------

  let gridDialog: HTMLDialogElement;
  let gridDraft = $state<GridSettings>(pickGrid(DEFAULT_SETTINGS));
  const clamped = $derived({ ...gridDraft, width: clampSize(gridDraft.width), height: clampSize(gridDraft.height) });
  const gridColors = $derived(effectivePalette(gridDraft));
  const duplicate = $derived(new Set(gridColors).size !== gridColors.length);
  const erased = $derived(erasedBy(editor.board, editor.grid, clamped));

  function openGrid() {
    gridDraft = pickGrid(editor.grid);
    gridDialog.showModal();
  }

  function applyGrid(e: SubmitEvent) {
    e.preventDefault();
    if (duplicate) return;
    gridDialog.close();
    editor.setGrid($state.snapshot(clamped));
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="toolbar" role="toolbar" aria-label="Editor tools">
  <div class="group swatches" role="radiogroup" aria-label="Draw color">
    {#each editor.palette as color, i (i)}
      {@const name = colors === 1 ? 'Fill' : names[i]}
      <button
        class="swatch"
        role="radio"
        aria-checked={!erase && tool === i + 1}
        aria-label={name}
        title="{name} ({i + 1})"
        style:background={color}
        onclick={() => ((activeColor = i + 1), (erase = false))}
      ></button>
    {/each}
    <button
      class="swatch erase-tool"
      role="radio"
      aria-checked={erase}
      aria-label="Erase"
      title="Erase (right click / X)"
      onclick={() => (erase = true)}
    ></button>
  </div>

  <div class="group">
    <button class="secondary" onclick={() => editor.undo()} disabled={!editor.canUndo} title="Undo (Ctrl+Z)">Undo</button>
    <button class="secondary" onclick={() => editor.redo()} disabled={!editor.canRedo} title="Redo (Ctrl+Y)">Redo</button>
    <button class="secondary" onclick={() => editor.clear()} disabled={editor.status.kind === 'empty'} title="Erase every cell">Clear</button>
  </div>

  <div class="group zoom" role="group" aria-label="Zoom">
    <button class="secondary" aria-label="Zoom out" title="Zoom out (-)" disabled={zoom <= 1} onclick={() => board?.zoomBy(1 / ZOOM_STEP)}
      >−</button
    >
    <button
      class="secondary"
      aria-label="Zoom in"
      title="Zoom in (+)"
      disabled={zoom >= zoomLimit - 0.001}
      onclick={() => board?.zoomBy(ZOOM_STEP)}>+</button
    >
  </div>

  <div class="group">
    <button class="secondary" onclick={openGrid} title="Size, colors and palette">Grid…</button>
    <button
      class="secondary"
      onclick={onCopy}
      disabled={!canCopy}
      title={canCopy ? 'Copy the puzzle you were playing (shows its solution)' : 'No puzzle was being played'}>Copy puzzle</button
    >
  </div>

  <div class="group">
    <button class="secondary" onclick={check} title="Run the line solver and highlight undetermined cells">Check</button>
    <button onclick={() => ready && onPlay(ready)} disabled={!ready} title={ready ? 'Play this puzzle' : notReady}>Play</button>
    <button class="secondary" onclick={() => ready && onShare(ready)} disabled={!ready} title={ready ? 'Copy a link to this puzzle' : notReady}
      >Share</button
    >
    <button class="secondary" onclick={onClose}>Close</button>
  </div>
</div>

<p class="status" class:ok={editor.status.kind === 'solvable'}>{statusText(editor.status)}</p>

{#key `${editor.grid.width}x${editor.grid.height}`}
  <Board
    bind:this={board}
    bind:zoom
    bind:zoomLimit
    game={editor}
    editing
    undetermined={editor.highlight}
    activeColor={tool}
    xMode={erase}
    wrong={new Set()}
    hint={null}
    {bg}
    showErrors={false}
  />
{/key}

<dialog bind:this={gridDialog} class="grid-dialog" aria-labelledby="grid-title">
  <form onsubmit={applyGrid}>
    <h2 id="grid-title">Grid</h2>
    <GridFields bind:value={gridDraft} />
    {#if erased > 0}<p class="warn">{plural(erased, 'drawn cell')} will be erased.</p>{/if}
    <div class="actions">
      <button type="button" class="secondary" onclick={() => gridDialog.close()}>Cancel</button>
      <button type="submit" disabled={duplicate}>Apply</button>
    </div>
  </form>
</dialog>

<style>
  .status {
    margin: 0 1rem 0.5rem;
    text-align: center;
    color: var(--muted);
  }

  .status.ok {
    color: var(--fg);
  }

  form {
    display: grid;
    gap: 0.9rem;
    min-width: min(22rem, 80vw);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .warn {
    margin: 0;
    color: var(--danger);
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
