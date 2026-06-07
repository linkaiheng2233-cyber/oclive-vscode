<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let label: string;
  export let value = '';
  export let options: { value: string; label: string }[] = [];
  export let disabled = false;
  const dispatch = createEventDispatcher<{ change: void }>();
</script>

<label class="field">
  <span class="label">{label}</span>
  <select bind:value {disabled} on:change={() => dispatch('change')}>
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0;
  }
  .label {
    font-size: 0.85em;
    opacity: 0.85;
  }
  select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
  }
</style>
