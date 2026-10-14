<script lang="ts">
  import type { Theme } from '../lib/state/settings.ts';

  interface Props {
    theme: Theme;
    /** Tint clues of impossible lines (SPEC §6.5). */
    showErrors: boolean;
    /** Auto-X finished lines (SPEC §6.5). */
    autoX: boolean;
  }
  let { theme = $bindable(), showErrors = $bindable(), autoX = $bindable() }: Props = $props();

  const THEMES: [Theme, string][] = [
    ['system', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }
</script>

<dialog bind:this={dialog} class="options" aria-labelledby="options-title">
  <h2 id="options-title">Options</h2>
  <fieldset>
    <legend>Theme</legend>
    {#each THEMES as [value, label] (value)}
      <label class="theme"><input type="radio" name="theme" {value} bind:group={theme} /> {label}</label>
    {/each}
  </fieldset>
  <label>
    <input type="checkbox" bind:checked={showErrors} />
    <span>
      Flag impossible lines
      <small>A clue turns red when that line's marks can no longer fit it.</small>
    </span>
  </label>
  <label>
    <input type="checkbox" bind:checked={autoX} />
    <span>
      Auto-X finished lines
      <small>When a line's filled cells match its clue, mark the rest empty.</small>
    </span>
  </label>
  <div class="actions"><button onclick={() => dialog.close()}>Done</button></div>
</dialog>

<style>
  h2 {
    margin: 0 0 1rem;
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  legend {
    font-weight: 600;
    margin-bottom: 0.4rem;
    padding: 0;
  }

  label.theme {
    margin: 0;
    align-items: center;
    gap: 0.35rem;
  }

  input[type='radio'] {
    margin: 0;
    accent-color: var(--accent);
  }

  label {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    margin-bottom: 0.9rem;
    max-width: 24rem;
    cursor: pointer;
  }

  input[type='checkbox'] {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--accent);
  }

  small {
    display: block;
    color: var(--muted);
    margin-top: 0.15rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
