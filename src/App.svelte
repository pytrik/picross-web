<script lang="ts">
  // Plain CSS imports are extracted to bundle.css and inlined into the single
  // file at build time. Component style blocks ride inside the JS bundle (never
  // write the literal tag in a script comment: svelte-check mis-parses it).
  import './styles/global.css';
  import { onMount } from 'svelte';
  import Board from './components/Board.svelte';
  import NewPuzzleDialog from './components/NewPuzzleDialog.svelte';
  import { parseHash } from './lib/puzzle/codec.ts';
  import { MARK_X } from './lib/puzzle/types.ts';
  import { fromDefinition, resolvePuzzle, type LoadedPuzzle } from './lib/source/index.ts';
  import { Game } from './lib/state/game.svelte.ts';
  import { effectivePalette, loadSettings, saveSettings, type Settings, type Theme } from './lib/state/settings.ts';
  import { defaultStorage } from './lib/state/storage.ts';
  import { formatTime, paletteNames } from './lib/ui/format.ts';
  import { generateInWorker } from './lib/workers/generate.ts';
  import type { GenerateOptions } from './lib/puzzle/generator.ts';

  const storage = defaultStorage();
  let settings = $state<Settings>(loadSettings(storage));
  $effect(() => saveSettings(storage, $state.snapshot(settings)));

  let game = $state.raw<Game | null>(null);
  let activeColor = $state(1);
  let xMode = $state(false);
  let wrong = $state.raw(new Set<number>());
  let wrongTimer: ReturnType<typeof setTimeout> | undefined;

  // --- theme -----------------------------------------------------------------

  let systemDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = $derived(settings.theme === 'dark' || (settings.theme === 'system' && systemDark));
  // Must match --bg in global.css; used for clue contrast.
  const bg = $derived(dark ? '#17191d' : '#faf9f6');
  $effect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  });
  const THEMES: Theme[] = ['system', 'light', 'dark'];
  const themeLabel: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

  // --- toast -----------------------------------------------------------------

  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 3000);
  }

  // --- loading puzzles (SPEC §4.3) -------------------------------------------

  let generating = $state(false);
  let genError = $state('');
  let genAbort: AbortController | null = null;
  let winDialog: HTMLDialogElement;
  let newDialog: ReturnType<typeof NewPuzzleDialog>;

  function setGame(puzzle: LoadedPuzzle) {
    game?.pause();
    game?.flush();
    const next = new Game(puzzle, storage, () => winDialog.showModal());
    game = next;
    activeColor = 1;
    xMode = false;
    wrong = new Set();
    if (document.visibilityState === 'visible') next.resume();
  }

  const optionsFrom = (s: Settings): GenerateOptions => ({
    width: s.width,
    height: s.height,
    palette: effectivePalette(s),
    density: s.density,
  });

  /** Options of the last generation attempt, so Retry repeats it. */
  let lastOpts: GenerateOptions | null = null;

  async function newPuzzle(replace: boolean, opts: GenerateOptions = optionsFrom(settings)) {
    lastOpts = opts;
    genAbort?.abort();
    const ctrl = new AbortController();
    genAbort = ctrl;
    generating = true;
    genError = '';
    try {
      const def = await generateInWorker(opts, ctrl.signal);
      const puzzle = fromDefinition(def);
      // pushState/replaceState don't fire hashchange, so no double load.
      if (replace) history.replaceState(null, '', `#${puzzle.hash}`);
      else history.pushState(null, '', `#${puzzle.hash}`);
      setGame(puzzle);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        genError = 'Could not generate a puzzle with these settings in time.';
      }
    } finally {
      if (genAbort === ctrl) {
        genAbort = null;
        generating = false;
      }
    }
  }

  async function loadFromHash() {
    const target = parseHash(location.hash);
    if (target.kind === 'none') return newPuzzle(true);
    if (target.kind === 'puzzle' && game && `p=${target.value}` === game.hash) return;
    // Navigating (Back/Forward, pasted link) wins over a generation in flight;
    // otherwise its result would replace the puzzle we're about to show.
    genAbort?.abort();
    try {
      setGame(await resolvePuzzle(target));
    } catch {
      showToast('This puzzle link is invalid or from a newer version.');
      await newPuzzle(true);
    }
  }

  function generate(next: Settings) {
    settings = next;
    newPuzzle(false, optionsFrom(next));
  }

  /**
   * Same size and colors as the current puzzle (which may have come from a
   * shared link, so not necessarily the saved settings). Density isn't part
   * of a puzzle definition, so the saved density is used.
   */
  function playAnother() {
    if (!game) return;
    const { width, height, palette } = game.def;
    newPuzzle(false, { width, height, palette, density: settings.density });
  }

  // --- actions ---------------------------------------------------------------

  function check() {
    if (!game || game.solved) return;
    clearTimeout(wrongTimer);
    wrong = new Set(game.check());
    if (wrong.size === 0) showToast('No mistakes so far.');
    wrongTimer = setTimeout(() => (wrong = new Set()), 2000);
  }

  async function restart() {
    if (!game) return;
    if (!(await showConfirm('Clear the board and timer for this puzzle?'))) return;
    game.restart();
    wrong = new Set();
  }

  let shareDialog: HTMLDialogElement;
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copied to clipboard.');
    } catch {
      shareDialog.showModal();
    }
  }

  function onGlobalKey(e: KeyboardEvent) {
    if (!game || document.querySelector('dialog[open]')) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) game.redo();
      else game.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      game.redo();
    } else if (!mod && !e.altKey && /^[1-6]$/.test(e.key) && Number(e.key) <= game.colors) {
      activeColor = Number(e.key);
      xMode = false;
    }
  }

  onMount(() => {
    loadFromHash();
    const onHash = () => loadFromHash();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        game?.pause();
        game?.flush();
      } else {
        game?.resume();
      }
    };
    const onPageHide = () => game?.flush();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => (systemDark = media.matches);
    const tick = setInterval(() => game?.tick(), 500);

    window.addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    media.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      media.removeEventListener('change', onMedia);
      clearInterval(tick);
    };
  });

  // --- custom dialogs (instead of native confirm()) ---------------------------

  let confirmDialog: HTMLDialogElement;
  let confirmMessage = $state('');
  let confirmResolve: ((value: boolean) => void) | null = null;

  function showConfirm(message: string): Promise<boolean> {
    confirmMessage = message;
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmDialog.showModal();
    });
  }

  function resolveConfirm(value: boolean) {
    confirmDialog.close();
    confirmResolve?.(value);
    confirmResolve = null;
  }
</script>

<svelte:window onkeydown={onGlobalKey} />

<header>
  <h1>Picross <span class="version">v{__APP_VERSION__}</span></h1>
  <nav>
    <button onclick={() => newDialog.open()}>New puzzle…</button>
    <button class="secondary" onclick={share} disabled={!game}>Share</button>
    <button
      class="secondary"
      title="Theme"
      onclick={() => (settings.theme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]!)}
    >
      {themeLabel[settings.theme]}
    </button>
  </nav>
</header>

{#if game}
  <div class="toolbar" role="toolbar" aria-label="Tools">
    <div class="group swatches" role="radiogroup" aria-label="Fill color">
      {#each game.def.palette as color, i (i)}
        {@const name = game.colors === 1 ? 'Fill' : `${paletteNames(game.def.palette)[i]}`}
        <button
          class="swatch"
          role="radio"
          aria-checked={!xMode && activeColor === i + 1}
          aria-label={name}
          title="{name} ({i + 1})"
          style:background={color}
          disabled={game.solved}
          onclick={() => ((activeColor = i + 1), (xMode = false))}
        ></button>
      {/each}
      <button
        class="swatch x-tool"
        role="radio"
        aria-checked={xMode}
        aria-label="Mark empty"
        title="Mark empty (right click / X)"
        disabled={game.solved}
        onclick={() => (xMode = true)}
      ></button>
    </div>

    <div class="group">
      <button class="secondary" onclick={() => game?.undo()} disabled={!game.canUndo || game.solved} title="Undo (Ctrl+Z)">Undo</button>
      <button class="secondary" onclick={() => game?.redo()} disabled={!game.canRedo || game.solved} title="Redo (Ctrl+Y)">Redo</button>
      <button class="secondary" onclick={check} disabled={game.solved} title="Highlight mistakes">Check</button>
      <button class="secondary" onclick={restart} title="Clear the board">Restart</button>
    </div>

    <div class="group status">
      <span class="timer" aria-label="Elapsed time">{formatTime(game.elapsedMs)}</span>
      {#if game.solved}<span class="badge">Solved</span>{/if}
    </div>
  </div>

  {#key game}
    <Board {game} {activeColor} {xMode} {wrong} {bg} />
  {/key}
{:else if !generating}
  <div class="empty">
    {#if genError}<p>{genError}</p>{/if}
    <button onclick={() => newPuzzle(true)}>{genError ? 'Retry' : 'Generate a puzzle'}</button>
  </div>
{/if}

{#if generating}
  <div class="overlay" role="status">
    <div class="panel">
      <div class="spinner" aria-hidden="true"></div>
      <p>Generating puzzle…</p>
      <button class="secondary" onclick={() => genAbort?.abort()}>Cancel</button>
    </div>
  </div>
{:else if genError && game}
  <div class="overlay" role="alert">
    <div class="panel">
      <p>{genError}</p>
      <div class="actions">
        <button class="secondary" onclick={() => (genError = '')}>Close</button>
        <button onclick={() => newPuzzle(false, lastOpts ?? undefined)}>Retry</button>
      </div>
    </div>
  </div>
{/if}

{#if toast}<div class="toast" role="status">{toast}</div>{/if}

<NewPuzzleDialog bind:this={newDialog} {settings} onGenerate={generate} />

<dialog bind:this={winDialog} aria-labelledby="win-title">
  {#if game}
    <h2 id="win-title">Solved!</h2>
    <dl class="stats">
      <dt>Size</dt>
      <dd>{game.def.width}×{game.def.height}</dd>
      <dt>Colors</dt>
      <dd>{game.colors}</dd>
      <dt>Time</dt>
      <dd>{formatTime(game.elapsedMs)}</dd>
      <dt>Checks used</dt>
      <dd>{game.checks}</dd>
    </dl>
    <div class="actions">
      <button class="secondary" onclick={() => winDialog.close()}>Close</button>
      <button
        class="secondary"
        onclick={() => {
          winDialog.close();
          newDialog.open();
        }}>New puzzle…</button
      >
      <button
        title="Same size and colors"
        onclick={() => {
          winDialog.close();
          playAnother();
        }}>Play another</button
      >
    </div>
  {/if}
</dialog>

<dialog bind:this={shareDialog}>
  <p>Copy this link to share the puzzle:</p>
  <input class="share-url" readonly value={location.href} onfocus={(e) => e.currentTarget.select()} />
  <div class="actions"><button onclick={() => shareDialog.close()}>OK</button></div>
</dialog>

<dialog bind:this={confirmDialog}>
  <p>{confirmMessage}</p>
  <div class="actions">
    <button class="secondary" onclick={() => resolveConfirm(false)}>Cancel</button>
    <button onclick={() => resolveConfirm(true)}>OK</button>
  </div>
</dialog>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem 0.5rem;
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  .version {
    font-size: 0.75rem;
    font-weight: normal;
    color: var(--muted);
  }

  nav,
  .group {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 1.25rem;
    padding: 0.25rem 1rem 0.75rem;
  }

  .swatch {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 0.4rem;
  }

  .swatch[aria-checked='true'] {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .x-tool {
    background: var(--cell-bg);
    position: relative;
  }

  .x-tool::before,
  .x-tool::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 60%;
    height: 2px;
    background: var(--x);
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .x-tool::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }

  .timer {
    font-variant-numeric: tabular-nums;
    font-size: 1.1rem;
    min-width: 4.5ch;
  }

  .badge {
    background: var(--success);
    color: #fff;
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
  }

  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
    z-index: 10;
  }

  .panel {
    background: var(--surface);
    color: var(--fg);
    padding: 1.5rem;
    border-radius: 0.6rem;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    max-width: 90vw;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    margin: 0 auto;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 1.5rem;
    transform: translateX(-50%);
    background: var(--fg);
    color: var(--bg);
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    z-index: 20;
    max-width: calc(100vw - 2rem);
  }

  .stats {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.3rem 1.5rem;
    margin: 1rem 0;
  }

  .stats dt {
    color: var(--muted);
  }

  .stats dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  h2 {
    margin: 0;
  }

  .share-url {
    width: min(30rem, 80vw);
    margin-bottom: 1rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .panel .actions {
    justify-content: center;
  }
</style>
