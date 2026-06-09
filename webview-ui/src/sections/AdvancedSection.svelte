<script lang="ts">
  import Toggle from '../shared/Toggle.svelte';
  import Select from '../shared/Select.svelte';
  import Collapsible from '../shared/Collapsible.svelte';
  import type { OcliveSettingsKey, SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let mockLlm = false;
  let autoDiscover = true;
  let promoteShared = true;
  let apiPort = 8420;
  let placement = 'sidebar';

  $: mockLlm = Boolean(state.config.mockLlm);
  $: autoDiscover = Boolean(state.config.autoDiscover);
  $: promoteShared = Boolean(state.config.promoteSharedKernel);
  $: apiPort = Number(state.config.apiPort ?? 8420);
  $: placement = String(state.config['settings.placement'] ?? 'sidebar');

  const placementOptions = [
    { value: 'sidebar', label: '侧栏内嵌（默认）' },
    { value: 'editor-beside', label: '编辑器旁（高级）' },
  ];

  function update(key: OcliveSettingsKey, value: unknown): void {
    post({ type: 'updateConfig', key, value });
  }
</script>

<h2 class="title">高级</h2>

<Select
  label="设置面板位置"
  bind:value={placement}
  options={placementOptions}
  on:change={() => update('settings.placement', placement)}
/>

<label class="field">
  <span>API 端口</span>
  <input type="number" bind:value={apiPort} on:change={() => update('apiPort', apiPort)} />
</label>
<Toggle
  label="自动发现 rolesDir / 内核二进制"
  bind:checked={autoDiscover}
  on:change={() => update('autoDiscover', autoDiscover)}
/>
<Toggle
  label="提升共享内核到 %LOCALAPPDATA%/OCLive/runtime"
  bind:checked={promoteShared}
  on:change={() => update('promoteSharedKernel', promoteShared)}
/>
<Toggle
  label="Mock LLM（spawn 时 OCLIVE_HTTP_API_MOCK_LLM=1）"
  bind:checked={mockLlm}
  on:change={() => update('mockLlm', mockLlm)}
/>
<p class="sub">修改端口或 mock 后请重连内核。</p>

<Collapsible title="实验性（未实现）">
  <p class="future">渗透 · 心声/信件等工作区 Markdown 写入尚未实现，无配置项。</p>
  <p class="future">idle 聚焦、终端一行展示等见 ROADMAP「渗透」段。</p>
</Collapsible>

<style>
  .title {
    font-size: 1em;
    margin: 0 0 10px;
    font-weight: 600;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0;
    font-size: 0.85em;
  }
  input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
    max-width: 120px;
  }
  .sub {
    font-size: 0.8em;
    opacity: 0.7;
  }
  .future {
    font-size: 0.85em;
    opacity: 0.65;
    margin: 4px 0;
  }
</style>
