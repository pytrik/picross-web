<script lang="ts">
  interface Props {
    /** Tint clues of impossible lines (SPEC §6.5). */
    showErrors: boolean;
    /** Auto-X finished lines (SPEC §6.5). */
    autoX: boolean;
  }
  let { showErrors = $bindable(), autoX = $bindable() }: Props = $props();

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }
</script>

<dialog bind:this={dialog} class="options" aria-labelledby="options-title">
  <h2 id="options-title">Options</h2>
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
