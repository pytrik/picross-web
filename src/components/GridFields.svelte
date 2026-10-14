<script lang="ts" generics="T extends GridSettings">
  // Size, color count, palette preset and swatch overrides (SPEC §5.1, §5.4),
  // shared by the New puzzle dialog and the editor's Grid dialog (§6.10).
  import { PALETTES, paletteById } from '../lib/puzzle/palettes.ts';
  import { MAX_COLORS, MAX_SIZE, MIN_SIZE } from '../lib/puzzle/types.ts';
  import { effectivePalette, type GridSettings } from '../lib/state/settings.ts';

  interface Props {
    value: T;
  }
  let { value = $bindable() }: Props = $props();

  const PRESETS = [5, 10, 15, 20, 25];
  const colors = $derived(effectivePalette(value));
  const duplicate = $derived(new Set(colors).size !== colors.length);

  function setOverride(i: number, color: string) {
    const next = [...value.overrides];
    while (next.length <= i) next.push(null);
    next[i] = color.toLowerCase() === paletteById(value.paletteId).colors[i] ? null : color.toLowerCase();
    value.overrides = next;
  }
</script>

<fieldset>
  <legend>Size</legend>
  <div class="chips">
    {#each PRESETS as n (n)}
      <button
        type="button"
        class="chip"
        class:active={value.width === n && value.height === n}
        onclick={() => ((value.width = n), (value.height = n))}>{n}×{n}</button
      >
    {/each}
  </div>
  <div class="custom">
    <label>W <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={value.width} /></label>
    <span>×</span>
    <label>H <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={value.height} /></label>
  </div>
</fieldset>

<fieldset>
  <legend>Colors</legend>
  <div class="chips">
    {#each { length: MAX_COLORS } as _, i (i)}
      <button type="button" class="chip" class:active={value.colors === i + 1} onclick={() => (value.colors = i + 1)}
        >{i + 1}</button
      >
    {/each}
  </div>
</fieldset>

<fieldset>
  <legend>Palette</legend>
  <div class="palettes">
    {#each PALETTES as p (p.id)}
      <label class="palette" class:active={value.paletteId === p.id}>
        <input type="radio" name="palette" value={p.id} bind:group={value.paletteId} onchange={() => (value.overrides = [])} />
        <span class="name">{p.name}</span>
        <span class="preview">
          {#each p.colors.slice(0, value.colors) as c (c)}<i style:background={c}></i>{/each}
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
    {#if value.overrides.some(Boolean)}
      <button type="button" class="link" onclick={() => (value.overrides = [])}>Reset colors</button>
    {/if}
  </div>
  {#if duplicate}<p class="error">Each color must be different.</p>{/if}
</fieldset>

<style>
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

  .error {
    color: var(--danger);
    margin: 0;
    font-size: 0.9rem;
  }
</style>
