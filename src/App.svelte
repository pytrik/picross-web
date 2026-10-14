<script lang="ts">
  // Plain CSS imports are extracted to bundle.css and inlined into the single
  // file at build time. Component <style> blocks ride inside the JS bundle.
  import './styles/global.css';
  import { persisted } from './lib/persisted';

  // Example reactive state that survives a reload via localStorage.
  const name = persisted<string>('name', '');

  // --- Custom dialogs (replace native alert()/confirm(), which browsers are
  // deprecating). Use <dialog> + showModal() instead. ---
  let alertDialog: HTMLDialogElement;
  let alertMessage = $state('');

  let confirmDialog: HTMLDialogElement;
  let confirmMessage = $state('');
  let confirmResolve: ((value: boolean) => void) | null = null;

  function showAlert(message: string) {
    alertMessage = message;
    alertDialog.showModal();
  }

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

<main>
  <h1>Single-file Svelte app</h1>
  <p>Edit <code>src/App.svelte</code> to start building.</p>

  <p>
    <input bind:value={$name} placeholder="Type — it persists across reloads" />
  </p>

  <p>
    <button onclick={() => showAlert('Hello from a custom dialog!')}>Alert</button>
    <button
      onclick={async () => showAlert((await showConfirm('Are you sure?')) ? 'Confirmed' : 'Cancelled')}
    >
      Confirm
    </button>
  </p>
</main>

<dialog bind:this={alertDialog}>
  <p>{alertMessage}</p>
  <button onclick={() => alertDialog.close()}>OK</button>
</dialog>

<dialog bind:this={confirmDialog}>
  <p>{confirmMessage}</p>
  <button onclick={() => resolveConfirm(false)}>Cancel</button>
  <button onclick={() => resolveConfirm(true)}>OK</button>
</dialog>
