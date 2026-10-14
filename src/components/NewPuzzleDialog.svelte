<script lang="ts">
  import { STYLES, STYLE_LABELS } from '../lib/puzzle/styles.ts';
  import { DENSITY_BANDS, DIFFICULTIES, MIN_AREA, RATING_LABELS, difficultyAllowed } from '../lib/puzzle/rating.ts';
  import { DEFAULT_SETTINGS, MAX_DENSITY, MIN_DENSITY, clampSize, effectivePalette, type Settings } from '../lib/state/settings.ts';
  import GridFields from './GridFields.svelte';

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

  const colors = $derived(effectivePalette(draft));
  const duplicate = $derived(new Set(colors).size !== colors.length);
  /** SPEC §5.5: Medium and Hard need a large enough board. */
  const tooSmall = $derived(draft.difficulty !== 'any' && !difficultyAllowed(draft.difficulty, draft.width, draft.height));
  const band = $derived(draft.difficulty === 'any' ? null : DENSITY_BANDS[draft.difficulty]);
  const pct = (v: number) => Math.round(v * 100);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (duplicate || tooSmall) return;
    draft.width = clampSize(draft.width);
    draft.height = clampSize(draft.height);
    dialog.close();
    onGenerate($state.snapshot(draft));
  }
</script>

<dialog bind:this={dialog} class="new-puzzle" aria-labelledby="new-title">
  <form onsubmit={submit}>
    <h2 id="new-title">New puzzle</h2>

    <GridFields bind:value={draft} />

    <fieldset>
      <legend>Style</legend>
      <div class="chips" role="radiogroup" aria-label="Style">
        {#each STYLES as style (style)}
          <button
            type="button"
            class="chip"
            role="radio"
            aria-checked={draft.style === style}
            class:active={draft.style === style}
            onclick={() => (draft.style = style)}>{STYLE_LABELS[style]}</button
          >
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Difficulty</legend>
      <div class="chips" role="radiogroup" aria-label="Difficulty">
        <button
          type="button"
          class="chip"
          role="radio"
          aria-checked={draft.difficulty === 'any'}
          class:active={draft.difficulty === 'any'}
          onclick={() => (draft.difficulty = 'any')}>Any</button
        >
        {#each DIFFICULTIES as level (level)}
          {@const allowed = difficultyAllowed(level, draft.width, draft.height)}
          {@const reason = `Needs a board of at least ${MIN_AREA[level]} cells`}
          <button
            type="button"
            class="chip"
            role="radio"
            aria-checked={draft.difficulty === level}
            class:active={draft.difficulty === level}
            class:unavailable={!allowed}
            title={allowed ? undefined : reason}
            aria-label={allowed ? undefined : `${RATING_LABELS[level]}, ${reason.toLowerCase()}`}
            onclick={() => (draft.difficulty = level)}>{RATING_LABELS[level]}</button
          >
        {/each}
      </div>
      {#if tooSmall && draft.difficulty !== 'any'}
        {@const area = draft.width * draft.height}
        <p class="error">{RATING_LABELS[draft.difficulty]} needs a board of at least {MIN_AREA[draft.difficulty]} cells; this one has {area}.</p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>
        Density
        <span class="muted">
          {#if band}{pct(band[0])}–{pct(band[1])}%, set by difficulty{:else}{pct(draft.density)}%{/if}
        </span>
      </legend>
      <input
        type="range"
        min={MIN_DENSITY}
        max={MAX_DENSITY}
        step="0.01"
        aria-label="Density"
        disabled={band !== null}
        bind:value={draft.density}
      />
      <div class="range-labels"><span>Sparse</span><span>Dense</span></div>
    </fieldset>

    <div class="actions">
      <button type="button" class="secondary" onclick={() => dialog.close()}>Cancel</button>
      <button type="submit" disabled={duplicate || tooSmall}>Generate</button>
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

  .chip.unavailable:not(.active) {
    opacity: 0.55;
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
