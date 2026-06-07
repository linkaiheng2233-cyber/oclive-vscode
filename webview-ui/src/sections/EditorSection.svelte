<script lang="ts">
  import Collapsible from '../shared/Collapsible.svelte';
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

<Collapsible title="编辑器" open={state.initialSection === 'editor'}>
  <Toggle
    label="发送消息时附带当前文件/选区上下文"
    bind:checked={includeEditor}
    on:change={onToggle}
  />
</Collapsible>
