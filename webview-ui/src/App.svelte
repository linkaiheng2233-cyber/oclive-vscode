<script lang="ts">
  import { onMount } from 'svelte';
  import type { HostToWebviewMessage, SettingsStateSnapshot } from '@protocol';
  import { getVsCodeApi } from './vscode';
  import KernelSection from './sections/KernelSection.svelte';
  import EditorSection from './sections/EditorSection.svelte';
  import RoleSection from './sections/RoleSection.svelte';
  import IdentitySection from './sections/IdentitySection.svelte';
  import ModelSection from './sections/ModelSection.svelte';
  import AdvancedSection from './sections/AdvancedSection.svelte';

  const vscode = getVsCodeApi();

  let state: SettingsStateSnapshot | null = null;
  let toast = '';

  function post(msg: unknown): void {
    vscode.postMessage(msg);
  }

  onMount(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      if (msg.type === 'state') {
        state = msg.payload;
        if (msg.payload.initialSection) {
          setTimeout(() => {
            const el = document.querySelector(`details[open]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }
      }
      if (msg.type === 'toast') {
        toast = msg.message;
        setTimeout(() => {
          toast = '';
        }, 4000);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  });
</script>

<div class="app">
  <header>
    <h1>OCLive 设置</h1>
    {#if toast}
      <div class="toast">{toast}</div>
    {/if}
  </header>
  {#if state}
    <main>
      <KernelSection {state} {post} />
      <EditorSection {state} {post} />
      <RoleSection {state} {post} />
      <IdentitySection {state} {post} />
      <ModelSection {state} {post} />
      <AdvancedSection {state} {post} />
    </main>
  {:else}
    <p class="loading">加载中…</p>
  {/if}
</div>

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
    padding: 8px 10px 16px;
  }
  h1 {
    font-size: 1.05em;
    margin: 0 0 10px;
    font-weight: 600;
  }
  .loading {
    opacity: 0.7;
    font-size: 0.9em;
  }
  .toast {
    font-size: 0.85em;
    padding: 6px 8px;
    margin-bottom: 8px;
    background: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
    border-radius: 3px;
  }
</style>
