<script lang="ts">
  import Toggle from '../shared/Toggle.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let includeEditor = Boolean(state.config.includeEditorContext);

  $: includeEditor = Boolean(state.config.includeEditorContext);

  function onToggle(): void {
    post({ type: 'updateConfig', key: 'includeEditorContext', value: includeEditor });
  }
</script>

<h2 class="title">编辑器</h2>
<Toggle
  label="发送消息时附带当前文件/选区上下文"
  bind:checked={includeEditor}
  on:change={onToggle}
/>

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
</style>
