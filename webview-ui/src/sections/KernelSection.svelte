<script lang="ts">
  import Collapsible from '../shared/Collapsible.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  const modeLabel: Record<string, string> = {
    attached: 'attach（附着已有内核）',
    spawned: 'spawn（扩展启动内核）',
    offline: '离线',
  };

  $: manifest = state.health?.kernel_manifest;
</script>

<Collapsible title="内核" open={state.initialSection === 'kernel'}>
  <p class="row"><strong>模式</strong> {modeLabel[state.kernelMode] ?? state.kernelMode}</p>
  <p class="row"><strong>端口</strong> :{state.config.apiPort}</p>
  <p class="row"><strong>数据目录</strong> <span class="mono">{state.sharedAppData}</span></p>
  {#if manifest?.version}
    <p class="row"><strong>内核版本</strong> {manifest.version}</p>
  {/if}
  {#if state.kernelMode === 'attached'}
    <p class="hint">当前内核可能由桌面端启动；发行版 profile 由已运行内核决定。</p>
  {/if}
  <p class="row mono">kernel: {state.discovery.kernelBinary || '（自动发现）'}</p>
  <button type="button" on:click={() => post({ type: 'reconnectKernel' })}>重连内核</button>
</Collapsible>

<style>
  .row { margin: 4px 0; font-size: 0.9em; }
  .mono { font-family: var(--vscode-editor-font-family); word-break: break-all; }
  .hint { font-size: 0.85em; opacity: 0.8; margin: 8px 0; }
  button {
    margin-top: 8px;
    padding: 4px 10px;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
  }
</style>
