<script lang="ts">
  import { onMount } from 'svelte';
  import Select from '../shared/Select.svelte';
  import type { HostToWebviewMessage, SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;
  export let ollamaModelsResult: Extract<
    HostToWebviewMessage,
    { type: 'ollamaModelsResult' }
  > | null = null;
  export let llmOperationDone: Extract<
    HostToWebviewMessage,
    { type: 'llmOperationDone' }
  > | null = null;
  export let llmOpSeq = 0;
  export let ollamaModelsSeq = 0;

  let providerTab: 'local' | 'cloud' = 'local';
  let ollamaBase = '';
  let sessionModel = '';
  let remoteUrl = '';
  let remoteToken = '';
  let remoteModel = '';
  let ollamaModels: string[] = [];
  let ollamaBaseTouched = false;
  let sessionModelTouched = false;
  let providerTabTouched = false;
  let remoteUrlTouched = false;
  let remoteModelTouched = false;
  let saving = false;
  let modelsLoading = false;
  let formError = '';
  let handledOpSeq = 0;
  let handledModelsSeq = 0;

  $: llm = state.llmSettings;
  $: attachHint = state.kernelMode === 'attached';
  $: llmSyncKey = llm
    ? `${llm.provider}|${llm.ollamaBaseUrl}|${llm.sessionOllamaModel}|${llm.effectiveModel}|${llm.remoteUrl}|${llm.remoteModel}`
    : '';
  let lastLlmSyncKey = '';

  $: if (llm && llmSyncKey !== lastLlmSyncKey) {
    if (!providerTabTouched) {
      providerTab = llm.provider === 'cloud' ? 'cloud' : 'local';
    }
    if (!ollamaBaseTouched) {
      ollamaBase = llm.ollamaBaseUrl?.trim() || 'http://127.0.0.1:11434';
    }
    if (!sessionModelTouched) {
      sessionModel = llm.sessionOllamaModel ?? llm.packOllamaModel ?? llm.effectiveModel ?? '';
    }
    if (!remoteUrlTouched) {
      remoteUrl = llm.remoteUrl ?? '';
    }
    if (!remoteModelTouched) {
      remoteModel = llm.remoteModel || llm.sessionOllamaModel || '';
    }
    lastLlmSyncKey = llmSyncKey;
  }

  $: if (state.ollamaModels.length && ollamaModels.length === 0 && !modelsLoading) {
    ollamaModels = state.ollamaModels;
  }

  $: modelOptions = ollamaModels.map((m) => ({ value: m, label: m }));
  $: overrideMismatch =
    llm?.provider === 'cloud' &&
    llm.sessionOllamaModel &&
    llm.remoteModel &&
    llm.sessionOllamaModel !== llm.remoteModel;

  $: if (ollamaModelsResult && ollamaModelsSeq > handledModelsSeq) {
    handledModelsSeq = ollamaModelsSeq;
    ollamaModels = ollamaModelsResult.models;
    if (ollamaModelsResult.error) {
      formError = ollamaModelsResult.error;
    } else {
      formError = '';
    }
  }

  $: if (llmOperationDone && llmOpSeq > handledOpSeq) {
    handledOpSeq = llmOpSeq;
    if (llmOperationDone.op === 'save' || llmOperationDone.op === 'sessionModel') {
      saving = false;
      if (llmOperationDone.ok) {
        resetTouchedFlags();
        if (llmOperationDone.op === 'save') {
          remoteToken = '';
        }
      }
    }
    if (llmOperationDone.op === 'refresh') {
      modelsLoading = false;
    }
  }

  function resetTouchedFlags(): void {
    ollamaBaseTouched = false;
    sessionModelTouched = false;
    providerTabTouched = false;
    remoteUrlTouched = false;
    remoteModelTouched = false;
  }

  function markOllamaBaseTouched(): void {
    ollamaBaseTouched = true;
  }

  function markRemoteUrlTouched(): void {
    remoteUrlTouched = true;
  }

  function onRemoteModelInput(): void {
    remoteModelTouched = true;
  }

  function selectLocalTab(): void {
    providerTab = 'local';
    providerTabTouched = true;
    void refreshModels();
  }

  function selectCloudTab(): void {
    providerTab = 'cloud';
    providerTabTouched = true;
    remoteModelTouched = false;
  }

  async function refreshModels(): Promise<void> {
    modelsLoading = true;
    formError = '';
    post({ type: 'refreshOllamaModels', ollamaBaseUrl: ollamaBase });
  }

  function onLocalModelChange(): void {
    sessionModelTouched = true;
    saving = true;
    post({
      type: 'setSessionModel',
      model: sessionModel || null,
      provider: 'local',
    });
  }

  async function saveLocal(): Promise<void> {
    formError = '';
    saving = true;
    post({
      type: 'saveLlmSettings',
      provider: 'local',
      ollamaBaseUrl: ollamaBase.trim(),
      ollamaModel: sessionModel.trim() || null,
    });
  }

  async function saveCloud(): Promise<void> {
    formError = '';
    if (!remoteUrl.trim()) {
      formError = '请填写 API Base URL';
      return;
    }
    if (!remoteModel.trim()) {
      formError = '请填写模型名';
      return;
    }
    const hasKey = remoteToken.trim().length > 0 || Boolean(llm?.remoteTokenConfigured);
    if (!hasKey) {
      formError = '请填写 API Key（已保存时可留空）';
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
  }

  onMount(() => {
    if (providerTab === 'local') {
      void refreshModels();
    }
  });
</script>

<h2 class="title">模型</h2>
{#if attachHint}
  <p class="hint">当前 attach 到桌面内核；部分设置可能被已运行内核的发行版 profile 限制。</p>
{/if}
{#if formError}
  <p class="warn">{formError}</p>
{/if}
{#if !llm}
  <p class="hint">无法读取 LLM 设置（内核未就绪？）</p>
{:else}
  <p class="row effective">
    <strong>生效模型</strong>
    <code>{llm.effectiveModel || '（未配置）'}</code>
  </p>

  <div class="tabs" role="tablist">
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={providerTab === 'local'}
      on:click={selectLocalTab}
    >本地 Ollama</button>
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={providerTab === 'cloud'}
      on:click={selectCloudTab}
    >云端 API</button>
  </div>

  {#if providerTab === 'local'}
    <label class="field">
      <span>Ollama Base URL</span>
      <input type="text" bind:value={ollamaBase} on:input={markOllamaBaseTouched} />
    </label>
    <button type="button" disabled={saving} on:click={saveLocal}>
      {saving ? '保存中…' : '保存本地设置'}
    </button>
    <p class="row">
      可达：{llm.ollamaReachable ? '是' : '否'}
      {#if llm.ollamaDetail} · {llm.ollamaDetail}{/if}
    </p>
    <p class="row">包默认：{llm.packOllamaModel ?? '—'}</p>
    <button type="button" disabled={modelsLoading || saving} on:click={refreshModels}>
      {modelsLoading ? '刷新中…' : '刷新模型列表'}
    </button>
    {#if modelOptions.length}
      <Select
        label="会话模型"
        bind:value={sessionModel}
        options={modelOptions}
        on:change={onLocalModelChange}
      />
    {:else if !modelsLoading}
      <p class="hint">未能拉取 Ollama 模型列表（服务未启动？）</p>
    {/if}
  {:else}
    {#if overrideMismatch}
      <p class="warn">会话 Ollama 覆盖（{llm.sessionOllamaModel}）与云端模型不一致；保存云端设置可修复。</p>
    {/if}
    <label class="field">
      <span>API Base URL</span>
      <input
        type="text"
        bind:value={remoteUrl}
        on:input={markRemoteUrlTouched}
        placeholder="https://api.openai.com"
      />
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
    <button type="button" disabled={saving} on:click={saveCloud}>
      {saving ? '保存中…' : '保存云端设置'}
    </button>
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
