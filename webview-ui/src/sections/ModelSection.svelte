<script lang="ts">
  import Collapsible from '../shared/Collapsible.svelte';
  import Select from '../shared/Select.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let ollamaBase = '';
  let sessionModel = '';
  let saving = false;

  $: llm = state.llmSettings;
  $: ollamaBase = llm?.ollamaBaseUrl ?? 'http://127.0.0.1:11434';
  $: sessionModel = llm?.sessionOllamaModel ?? llm?.effectiveModel ?? '';
  $: modelOptions = state.ollamaModels.map((m) => ({ value: m, label: m }));
  $: attachHint = state.kernelMode === 'attached';

  async function saveBase(): Promise<void> {
    saving = true;
    post({ type: 'saveLlmSettings', ollamaBaseUrl: ollamaBase, ollamaModel: sessionModel || null });
    saving = false;
  }

  function onModelChange(): void {
    post({ type: 'setSessionModel', model: sessionModel || null });
  }
</script>

<Collapsible title="模型（Ollama）" open={state.initialSection === 'model'}>
  {#if attachHint}
    <p class="hint">当前 attach 到桌面内核；部分设置可能被已运行内核的发行版 profile 限制。</p>
  {/if}
  {#if !llm}
    <p class="hint">无法读取 LLM 设置（内核未就绪？）</p>
  {:else}
    <label class="field">
      <span>Ollama Base URL</span>
      <input type="text" bind:value={ollamaBase} />
    </label>
    <button type="button" disabled={saving} on:click={saveBase}>保存 Base URL</button>
    <p class="row">
      可达：{llm.ollamaReachable ? '是' : '否'}
      {#if llm.ollamaDetail} · {llm.ollamaDetail}{/if}
    </p>
    <p class="row">包默认：{llm.packOllamaModel ?? '—'}</p>
    <p class="row">生效模型：{llm.effectiveModel}</p>
    {#if modelOptions.length}
      <Select
        label="会话模型"
        bind:value={sessionModel}
        options={modelOptions}
        on:change={onModelChange}
      />
    {:else}
      <p class="hint">未能拉取 Ollama 模型列表（服务未启动？）</p>
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
  .hint { font-size: 0.85em; opacity: 0.75; margin-bottom: 6px; }
</style>
