<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let label: string;
  export let checked = false;
  export let disabled = false;
  const dispatch = createEventDispatcher<{ change: void }>();
</script>

<label class="toggle">
  <input
    type="checkbox"
    bind:checked
    {disabled}
    on:change={() => dispatch('change')}
  />
  <span>{label}</span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin: 6px 0;
  }
  input:disabled + span {
    opacity: 0.5;
  }
</style>
