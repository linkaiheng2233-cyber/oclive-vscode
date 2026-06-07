<script lang="ts">
  import Collapsible from '../shared/Collapsible.svelte';
  import Toggle from '../shared/Toggle.svelte';
  import type { OcliveSettingsKey, SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let mockLlm = false;
  let autoDiscover = true;
  let promoteShared = true;
  let apiPort = 8420;

  $: mockLlm = Boolean(state.config.mockLlm);
  $: autoDiscover = Boolean(state.config.autoDiscover);
  $: promoteShared = Boolean(state.config.promoteSharedKernel);
  $: apiPort = Number(state.config.apiPort ?? 8420);

  function update(key: OcliveSettingsKey, value: unknown): void {
    post({ type: 'updateConfig', key, value });
  }
</script>

<Collapsible title="高级" open={state.initialSection === 'advanced'}>
  <label class="field">
    <span>API 端口</span>
    <input
      type="number"
      bind:value={apiPort}
      on:change={() => update('apiPort', apiPort)}
    />
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
  <hr />
  <p class="future">[Future] 渗透 · 心声/信件</p>
  <Toggle label="penetration.letterEnabled" checked={false} disabled />
  <p class="future">[Future] 渗透 · 心声 Markdown</p>
  <Toggle label="penetration.heartVoiceEnabled" checked={false} disabled />
</Collapsible>

<style>
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
  .sub { font-size: 0.8em; opacity: 0.7; }
  .future { font-size: 0.85em; opacity: 0.65; margin: 8px 0 4px; }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 10px 0; }
</style>
