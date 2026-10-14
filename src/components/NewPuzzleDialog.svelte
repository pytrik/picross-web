<script lang="ts">
  import { PALETTES, paletteById } from '../lib/puzzle/palettes.ts';
  import { MAX_COLORS, MAX_SIZE, MIN_SIZE } from '../lib/puzzle/types.ts';
  import { DEFAULT_SETTINGS, MAX_DENSITY, MIN_DENSITY, effectivePalette, type Settings } from '../lib/state/settings.ts';

  interface Props {
    settings: Settings;
    onGenerate: (settings: Settings) => void;
  }
  let { settings, onGenerate }: Props = $props();

  let dialog: HTMLDialogElement;
  // Edit a draft; only commit on Generate.
  let draft = $state<Settings>(structuredClone(DEFAULT_SETTINGS));

  export function open() {
    draft = structuredClone($state.snapshot(settings));
    dialog.showModal();
  }

  const PRESETS = [5, 10, 15, 20, 25];
  const colors = $derived(effectivePalette(draft));
  const duplicate = $derived(new Set(colors).size !== colors.length);
  const clampSize = (v: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(v) || MIN_SIZE));

  function setOverride(i: number, value: string) {
    const next = [...draft.overrides];
    while (next.length <= i) next.push(null);
    next[i] = value.toLowerCase() === paletteById(draft.paletteId).colors[i] ? null : value.toLowerCase();
    draft.overrides = next;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (duplicate) return;
    draft.width = clampSize(draft.width);
    draft.height = clampSize(draft.height);
    dialog.close();
    onGenerate($state.snapshot(draft));
  }
</script>

<dialog bind:this={dialog} class="new-puzzle" aria-labelledby="new-title">
  <form onsubmit={submit}>
    <h2 id="new-title">New puzzle</h2>

    <fieldset>
      <legend>Size</legend>
      <div class="chips">
        {#each PRESETS as n (n)}
          <button
            type="button"
            class="chip"
            class:active={draft.width === n && draft.height === n}
            onclick={() => ((draft.width = n), (draft.height = n))}>{n}×{n}</button
          >
        {/each}
      </div>
      <div class="custom">
        <label>W <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={draft.width} /></label>
        <span>×</span>
        <label>H <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={draft.height} /></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Colors</legend>
      <div class="chips">
        {#each { length: MAX_COLORS } as _, i (i)}
          <button type="button" class="chip" class:active={draft.colors === i + 1} onclick={() => (draft.colors = i + 1)}
            >{i + 1}</button
          >
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Palette</legend>
      <div class="palettes">
        {#each PALETTES as p (p.id)}
          <label class="palette" class:active={draft.paletteId === p.id}>
            <input type="radio" name="palette" value={p.id} bind:group={draft.paletteId} onchange={() => (draft.overrides = [])} />
            <span class="name">{p.name}</span>
            <span class="preview">
              {#each p.colors.slice(0, draft.colors) as c (c)}<i style:background={c}></i>{/each}
            </span>
          </label>
        {/each}
      </div>
      <div class="swatches">
        {#each colors as c, i (i)}
          <label class="swatch" title="Change color {i + 1}">
            <input type="color" value={c} oninput={(e) => setOverride(i, e.currentTarget.value)} />
          </label>
        {/each}
        {#if draft.overrides.some(Boolean)}
          <button type="button" class="link" onclick={() => (draft.overrides = [])}>Reset colors</button>
        {/if}
      </div>
      {#if duplicate}<p class="error">Each color must be different.</p>{/if}
    </fieldset>

    <fieldset>
      <legend>Density <span class="muted">{Math.round(draft.density * 100)}%</span></legend>
      <input type="range" min={MIN_DENSITY} max={MAX_DENSITY} step="0.01" bind:value={draft.density} />
      <div class="range-labels"><span>Sparse</span><span>Dense</span></div>
    </fieldset>

    <div class="actions">
      <button type="button" class="secondary" onclick={() => dialog.close()}>Cancel</button>
      <button type="submit" disabled={duplicate}>Generate</button>
    </div>
  </form>
</dialog>

<style>
  form {
    display: grid;
    gap: 0.9rem;
    min-width: min(22rem, 80vw);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  legend {
    font-weight: 600;
    padding: 0;
    margin-bottom: 0.4rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .custom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .custom input {
    width: 4.5rem;
  }

  .palettes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.35rem;
  }

  .palette {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    cursor: pointer;
  }

  .palette.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .palette input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .preview {
    display: flex;
    gap: 2px;
  }

  .preview i {
    width: 1rem;
    height: 1rem;
    border-radius: 2px;
  }

  .swatches {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .swatch input {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: none;
    cursor: pointer;
  }

  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
  }

  .muted,
  .range-labels {
    color: var(--muted);
    font-weight: normal;
  }

  .error {
    color: var(--danger);
    margin: 0;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
