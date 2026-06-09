<script lang="ts">
  import Select from '../shared/Select.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let providerTab: 'local' | 'cloud' = 'local';
  let ollamaBase = '';
  let sessionModel = '';
  let remoteUrl = '';
  let remoteToken = '';
  let remoteModel = '';
  let remoteModelTouched = false;
  let saving = false;
  let modelsLoading = false;

  $: llm = state.llmSettings;
  $: attachHint = state.kernelMode === 'attached';
  $: if (llm) {
    providerTab = llm.provider === 'cloud' ? 'cloud' : 'local';
    ollamaBase = llm.ollamaBaseUrl ?? 'http://127.0.0.1:11434';
    sessionModel = llm.sessionOllamaModel ?? llm.packOllamaModel ?? llm.effectiveModel ?? '';
    remoteUrl = llm.remoteUrl ?? '';
    if (!remoteModelTouched) {
      remoteModel = llm.remoteModel || llm.sessionOllamaModel || '';
    }
  }
  $: modelOptions = state.ollamaModels.map((m) => ({ value: m, label: m }));
  $: overrideMismatch =
    llm?.provider === 'cloud' &&
    llm.sessionOllamaModel &&
    llm.remoteModel &&
    llm.sessionOllamaModel !== llm.remoteModel;

  function onRemoteModelInput(): void {
    remoteModelTouched = true;
  }

  async function refreshModels(): Promise<void> {
    modelsLoading = true;
    post({ type: 'refreshOllamaModels' });
    modelsLoading = false;
  }

  function onLocalModelChange(): void {
    post({ type: 'setSessionModel', model: sessionModel || null });
  }

  async function saveLocal(): Promise<void> {
    saving = true;
    post({
      type: 'saveLlmSettings',
      provider: 'local',
      ollamaBaseUrl: ollamaBase,
      ollamaModel: sessionModel || null,
    });
    saving = false;
  }

  async function saveCloud(): Promise<void> {
    if (!remoteUrl.trim()) {
      return;
    }
    if (!remoteModel.trim()) {
      return;
    }
    saving = true;
    const msg: Record<string, unknown> = {
      type: 'saveLlmSettings',
      provider: 'cloud',
      cloudApiStyle: 'openai',
      remoteUrl: remoteUrl.trim(),
      remoteModel: remoteModel.trim(),
    };
    if (remoteToken.trim()) {
      msg.remoteToken = remoteToken.trim();
    }
    post(msg);
    remoteModelTouched = false;
    remoteToken = '';
    saving = false;
  }
</script>

<h2 class="title">模型</h2>
{#if attachHint}
  <p class="hint">当前 attach 到桌面内核；部分设置可能被已运行内核的发行版 profile 限制。</p>
{/if}
{#if !llm}
  <p class="hint">无法读取 LLM 设置（内核未就绪？）</p>
{:else}
  <p class="row effective">
    <strong>生效模型</strong>
    <code>{llm.effectiveModel}</code>
  </p>

  <div class="tabs" role="tablist">
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={providerTab === 'local'}
      on:click={() => { providerTab = 'local'; }}
    >本地 Ollama</button>
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={providerTab === 'cloud'}
      on:click={() => { providerTab = 'cloud'; remoteModelTouched = false; }}
    >云端 API</button>
  </div>

  {#if providerTab === 'local'}
    <label class="field">
      <span>Ollama Base URL</span>
      <input type="text" bind:value={ollamaBase} />
    </label>
    <button type="button" disabled={saving} on:click={saveLocal}>保存本地设置</button>
    <p class="row">
      可达：{llm.ollamaReachable ? '是' : '否'}
      {#if llm.ollamaDetail} · {llm.ollamaDetail}{/if}
    </p>
    <p class="row">包默认：{llm.packOllamaModel ?? '—'}</p>
    <button type="button" disabled={modelsLoading} on:click={refreshModels}>
      {modelsLoading ? '刷新中…' : '刷新模型列表'}
    </button>
    {#if modelOptions.length}
      <Select
        label="会话模型"
        bind:value={sessionModel}
        options={modelOptions}
        on:change={onLocalModelChange}
      />
    {:else}
      <p class="hint">未能拉取 Ollama 模型列表（服务未启动？）</p>
    {/if}
  {:else}
    {#if overrideMismatch}
      <p class="warn">会话 Ollama 覆盖（{llm.sessionOllamaModel}）与云端模型不一致；保存云端设置可修复。</p>
    {/if}
    <label class="field">
      <span>API Base URL</span>
      <input type="text" bind:value={remoteUrl} placeholder="https://api.openai.com" />
    </label>
    <label class="field">
      <span>API Key</span>
      <input
        type="password"
        bind:value={remoteToken}
        placeholder={llm.remoteTokenConfigured ? '留空则不修改' : '必填'}
        autocomplete="off"
      />
    </label>
    <label class="field">
      <span>模型名</span>
      <input
        type="text"
        bind:value={remoteModel}
        on:input={onRemoteModelInput}
        placeholder="deepseek-v4-pro"
      />
    </label>
    <button type="button" disabled={saving} on:click={saveCloud}>保存云端设置</button>
    {#if llm.remoteUrlEnvActive || llm.remoteTokenEnvActive}
      <p class="hint">部分配置来自环境变量（OCLIVE_REMOTE_LLM_*）。</p>
    {/if}
  {/if}

  {#if state.roleInfo?.reply_post_processor_enabled}
    <p class="row">
      后处理（只读）：{state.roleInfo.reply_post_processor_backend}
      {#if state.roleInfo.reply_post_processor_profile}
        · {state.roleInfo.reply_post_processor_profile}
      {/if}
    </p>
  {/if}
{/if}

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
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
  }
  button {
    margin: 6px 0;
    padding: 4px 10px;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
  }
  button:disabled { opacity: 0.5; }
  .row { font-size: 0.85em; margin: 4px 0; }
  .effective code {
    font-family: var(--vscode-editor-font-family);
    margin-left: 6px;
  }
  .hint { font-size: 0.85em; opacity: 0.75; margin-bottom: 6px; }
  .warn {
    font-size: 0.85em;
    padding: 6px 8px;
    margin: 6px 0;
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 3px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin: 8px 0;
  }
  .tab {
    flex: 1;
    margin: 0;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .tab.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
</style>
