<script lang="ts">
  import type {
    ChatStorageCapabilitiesSnapshot,
    ChatStorageSearchHit,
    ChatStorageSessionSnapshot,
    SettingsStateSnapshot,
    WebviewToHostMessage,
  } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: WebviewToHostMessage) => void;

  export let capabilities: ChatStorageCapabilitiesSnapshot | null = null;
  export let sessions: ChatStorageSessionSnapshot[] = [];
  export let searchHits: ChatStorageSearchHit[] = [];
  export let storageLoading = false;
  export let storageError = '';

  let searchQuery = '';
  let loading = false;

  $: roleId = String(state.currentRoleId ?? state.config.roleId ?? '');
  $: if (storageLoading === false) loading = false;
  $: if (sessions.length || storageError) loading = false;

  function loadState(): void {
    loading = true;
    post({ type: 'loadStorageState' });
  }

  function runSearch(): void {
    const q = searchQuery.trim();
    if (!q) return;
    loading = true;
    post({ type: 'searchStorage', query: q });
  }

  function exportSession(sessionId: string): void {
    post({ type: 'exportStorage', kind: 'session', sessionId, format: 'markdown' });
  }

  function exportRole(): void {
    post({ type: 'exportStorage', kind: 'role', format: 'markdown' });
  }

  loadState();
</script>

<h2 class="title">聊天存储</h2>
<p class="hint">
  会话与消息由内核 SQLite 管理（与桌面端共享 <code>%LOCALAPPDATA%/OCLive/data</code>）。
  单条删改请在 Chat 消息菜单操作。
</p>

{#if storageError}
  <p class="err">{storageError}</p>
{/if}

{#if capabilities}
  <p class="meta">
    后端：{capabilities.backend_kind}
    {#if capabilities.supports_search} · 支持搜索{/if}
  </p>
{/if}

<div class="row">
  <button type="button" class="btn" disabled={loading} on:click={loadState}>刷新会话列表</button>
  <button type="button" class="btn" disabled={loading || !roleId} on:click={exportRole}>
    导出当前角色全部会话 (Markdown)
  </button>
</div>

{#if sessions.length}
  <ul class="sessions">
    {#each sessions as s}
      <li>
        <div class="sess-head">
          <span class="sess-id" title={s.session_id}>{s.session_id.slice(0, 12)}…</span>
          <span class="sess-meta">{s.message_count} 条 · {s.updated_at.slice(0, 10)}</span>
        </div>
        <p class="snippet">{s.last_message_snippet || '（无摘要）'}</p>
        <button type="button" class="btn small" on:click={() => exportSession(s.session_id)}>
          导出此会话
        </button>
      </li>
    {/each}
  </ul>
{:else if !loading}
  <p class="sub">暂无会话记录（先聊几轮后刷新）。</p>
{/if}

{#if capabilities?.supports_search}
  <div class="search">
    <label class="field">
      <span>搜索消息</span>
      <input type="search" bind:value={searchQuery} placeholder="关键词" on:keydown={(e) => e.key === 'Enter' && runSearch()} />
    </label>
    <button type="button" class="btn" disabled={loading || !searchQuery.trim()} on:click={runSearch}>
      搜索
    </button>
  </div>
  {#if searchHits.length}
    <ul class="hits">
      {#each searchHits as h}
        <li>
          <span class="hit-meta">{h.created_at.slice(0, 16)} · {h.session_id.slice(0, 8)}…</span>
          <p>{h.content}</p>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .title {
    font-size: 1em;
    margin: 0 0 8px;
    font-weight: 600;
  }
  .hint,
  .sub,
  .meta {
    font-size: 0.82em;
    opacity: 0.85;
    line-height: 1.4;
    margin: 0 0 10px;
  }
  .err {
    color: var(--vscode-errorForeground);
    font-size: 0.85em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 0.82em;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.small {
    margin-top: 4px;
    padding: 2px 8px;
    font-size: 0.78em;
  }
  .sessions,
  .hits {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  .sessions li,
  .hits li {
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 6px;
    font-size: 0.82em;
  }
  .sess-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .sess-id {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.9em;
  }
  .sess-meta,
  .hit-meta {
    opacity: 0.7;
    font-size: 0.85em;
  }
  .snippet {
    margin: 4px 0 0;
    opacity: 0.9;
  }
  .search {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85em;
  }
  input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
    min-width: 160px;
  }
</style>
