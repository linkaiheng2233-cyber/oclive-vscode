<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    AppView,
    ChatPatchPayload,
    HostToWebviewMessage,
    SettingsSection,
    SettingsStateSnapshot,
    WebviewToHostMessage,
  } from '@protocol';
  import { getVsCodeApi } from './vscode';
  import ChatView from './ChatView.svelte';
  import KernelSection from './sections/KernelSection.svelte';
  import EditorSection from './sections/EditorSection.svelte';
  import RoleSection from './sections/RoleSection.svelte';
  import IdentitySection from './sections/IdentitySection.svelte';
  import ModelSection from './sections/ModelSection.svelte';
  import LayoutSection from './sections/LayoutSection.svelte';
  import AdvancedSection from './sections/AdvancedSection.svelte';
  import PenetrationSection from './sections/PenetrationSection.svelte';

  const vscode = getVsCodeApi();

  const navItems: { id: SettingsSection; label: string }[] = [
    { id: 'kernel', label: '内核' },
    { id: 'editor', label: '编辑器' },
    { id: 'role', label: '角色' },
    { id: 'identity', label: '身份' },
    { id: 'model', label: '模型' },
    { id: 'layout', label: '布局' },
    { id: 'penetration', label: '渗透' },
    { id: 'advanced', label: '高级' },
  ];

  let appView: AppView = 'chat';
  let chatView: ChatView | undefined;
  let state: SettingsStateSnapshot | null = null;
  let toast = '';
  let activeSection: SettingsSection = 'kernel';
  let ollamaModelsResult: Extract<HostToWebviewMessage, { type: 'ollamaModelsResult' }> | null = null;
  let llmOperationDone: Extract<HostToWebviewMessage, { type: 'llmOperationDone' }> | null = null;
  let llmOpSeq = 0;
  let ollamaModelsSeq = 0;

  function post(msg: WebviewToHostMessage): void {
    vscode.postMessage(msg);
  }

  function selectSection(section: SettingsSection): void {
    activeSection = section;
    post({ type: 'navigateSection', section });
  }

  function backToChat(): void {
    post({ type: 'closeSettings' });
  }

  function applyChatPatch(payload: ChatPatchPayload): void {
    chatView?.handleHostPatch(payload);
  }

  onMount(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      if (msg.type === 'view') {
        appView = msg.view;
        if (msg.view === 'settings' && msg.initialSection) {
          activeSection = msg.initialSection;
        }
      }
      if (msg.type === 'chatPatch') {
        applyChatPatch(msg.payload);
      }
      if (msg.type === 'state') {
        state = msg.payload;
        if (msg.payload.initialSection) {
          activeSection = msg.payload.initialSection;
        }
      }
      if (msg.type === 'ollamaModelsResult') {
        ollamaModelsSeq += 1;
        ollamaModelsResult = msg;
      }
      if (msg.type === 'llmOperationDone') {
        llmOpSeq += 1;
        llmOperationDone = msg;
      }
      if (msg.type === 'toast') {
        toast = msg.message;
        setTimeout(() => {
          toast = '';
        }, 4000);
      }
    };
    window.addEventListener('message', handler);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  });
</script>

{#if appView === 'chat'}
  <ChatView bind:this={chatView} />
{:else}
  <div class="app">
    <header class="top">
      <button type="button" class="back" on:click={backToChat}>← 返回聊天</button>
      {#if toast}
        <div class="toast">{toast}</div>
      {/if}
    </header>
    {#if state}
      <div class="layout">
        <nav class="nav">
          {#each navItems as item}
            <button
              type="button"
              class="nav-item"
              class:active={activeSection === item.id}
              on:click={() => selectSection(item.id)}
            >{item.label}</button>
          {/each}
        </nav>
        <main class="content">
          {#if activeSection === 'kernel'}
            <KernelSection {state} {post} />
          {:else if activeSection === 'editor'}
            <EditorSection {state} {post} />
          {:else if activeSection === 'role'}
            <RoleSection {state} />
          {:else if activeSection === 'identity'}
            <IdentitySection {state} {post} />
          {:else if activeSection === 'model'}
            <ModelSection
              {state}
              {post}
              {ollamaModelsResult}
              {llmOperationDone}
              {llmOpSeq}
              ollamaModelsSeq={ollamaModelsSeq}
            />
          {:else if activeSection === 'layout'}
            <LayoutSection {state} {post} />
          {:else if activeSection === 'penetration'}
            <PenetrationSection {state} {post} />
          {:else if activeSection === 'advanced'}
            <AdvancedSection {state} {post} />
          {/if}
        </main>
      </div>
    {:else}
      <p class="loading">加载中…</p>
    {/if}
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .top {
    flex-shrink: 0;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, #444);
  }
  .back {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 0.85em;
    padding: 4px 0;
  }
  .back:hover {
    text-decoration: underline;
  }
  .layout {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .nav {
    flex-shrink: 0;
    width: 88px;
    border-right: 1px solid var(--vscode-widget-border, #444);
    display: flex;
    flex-direction: column;
    padding: 4px 0;
    overflow-y: auto;
  }
  .nav-item {
    background: transparent;
    border: none;
    text-align: left;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 0.82em;
    color: var(--vscode-foreground);
    opacity: 0.85;
  }
  .nav-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .nav-item.active {
    opacity: 1;
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px 16px;
    min-width: 0;
  }
  .loading {
    opacity: 0.7;
    font-size: 0.9em;
    padding: 12px;
  }
  .toast {
    font-size: 0.85em;
    padding: 6px 8px;
    margin-top: 6px;
    background: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
    border-radius: 3px;
  }
</style>
