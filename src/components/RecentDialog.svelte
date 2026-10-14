<script lang="ts">
  import { MARK_X, UNKNOWN } from '../lib/puzzle/types.ts';
  import { clearProgress, listRecent, type RecentEntry } from '../lib/state/progress.ts';
  import type { KV } from '../lib/state/storage.ts';
  import { formatTime, formatWhen } from '../lib/ui/format.ts';

  interface Props {
    storage: KV | null;
    /** Storage key of the puzzle on screen. */
    currentKey: string | null;
    /** Opens a stored puzzle by its hash body (SPEC §6.8). */
    onOpen: (hash: string) => void;
  }
  let { storage, currentKey, onOpen }: Props = $props();

  let dialog: HTMLDialogElement;
  let entries = $state.raw<RecentEntry[]>([]);

  /** Callers flush the current game first so its entry is up to date. */
  export function open() {
    entries = listRecent(storage);
    dialog.showModal();
  }

  function remove(key: string) {
    clearProgress(storage, key);
    entries = listRecent(storage);
  }

  function choose(entry: RecentEntry) {
    dialog.close();
    if (entry.key !== currentKey) onOpen(entry.hash);
  }

  /** Draws the player's board (never the solution) as a thumbnail. */
  function thumbnail(canvas: HTMLCanvasElement, entry: RecentEntry) {
    const { width, height, palette } = entry.def;
    const scale = Math.max(2, Math.floor(60 / Math.max(width, height)));
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--cell-bg').trim() || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    entry.board.forEach((v, i) => {
      if (v === UNKNOWN || v === MARK_X) return;
      ctx.fillStyle = palette[v - 1]!;
      ctx.fillRect((i % width) * scale, Math.floor(i / width) * scale, scale, scale);
    });
  }
</script>

<dialog bind:this={dialog} class="recent" aria-labelledby="recent-title">
  <h2 id="recent-title">Recent puzzles</h2>
  {#if entries.length === 0}
    <p class="none">No saved puzzles yet. Puzzles appear here once you've made a move.</p>
  {:else}
    <ul>
      {#each entries as entry (entry.key)}
        {@const current = entry.key === currentKey}
        <li>
          <button class="entry" onclick={() => choose(entry)}>
            <span class="thumb"><canvas use:thumbnail={entry} aria-hidden="true"></canvas></span>
            <span class="info">
              <span class="title">
                {entry.def.width}×{entry.def.height} · {entry.def.palette.length}
                {entry.def.palette.length === 1 ? 'color' : 'colors'}
                {#if current}<span class="tag">Current</span>{/if}
              </span>
              <span class="meta">
                {entry.solved ? 'Solved' : 'In progress'} · {formatTime(entry.elapsedMs)} · {formatWhen(entry.updatedAt)}
              </span>
            </span>
          </button>
          {#if !current}
            <button
              class="secondary delete"
              aria-label="Delete {entry.def.width}×{entry.def.height} puzzle"
              title="Delete"
              onclick={() => remove(entry.key)}>Delete</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="actions"><button onclick={() => dialog.close()}>Close</button></div>
</dialog>

<style>
  h2 {
    margin: 0 0 0.75rem;
  }

  .recent {
    width: min(30rem, calc(100vw - 2rem));
  }

  ul {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    max-height: 60vh;
    overflow: auto;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
    padding: 0.4rem 0;
  }

  .entry {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: none;
    border: 1px solid transparent;
    color: var(--fg);
    text-align: left;
    padding: 0.3rem;
  }

  .entry:hover {
    border-color: var(--border);
  }

  .thumb {
    width: 62px;
    height: 62px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }

  canvas {
    border: 1px solid var(--grid-strong);
    image-rendering: pixelated;
    background: var(--cell-bg);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .title {
    font-weight: 600;
  }

  .meta,
  .none {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .tag {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
  }

  .delete {
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
