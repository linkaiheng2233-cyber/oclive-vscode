<script lang="ts">
  import { afterUpdate, onMount } from 'svelte';
  import type { ChatLine, ChatPatchPayload, RoleOptionSnapshot, SettingsSection } from '@protocol';
  import { getVsCodeApi } from './vscode';

  const vscode = getVsCodeApi();

  const PORTRAIT_MIN = 96;
  const portraitMax = () => Math.min(420, window.innerHeight * 0.55);

  let roleName = '角色';
  let roleOptions: RoleOptionSnapshot[] = [];
  let currentRoleId = '';
  let roleSwitching = false;
  let portraitSrc = '';
  let portraitEmoji = '😐';
  let portraitPaneHeight = 180;
  let emotion = 'neutral';
  let identityLabel = '';
  let connectionSummary = '';
  let llmSummary = '';
  let editorChip = '';
  let sending = false;
  let thinkingSeconds = 0;
  let streamingReply: string | null = null;
  let sessionOptions: { id: string; label: string }[] = [];
  let currentSessionId = '';
  let workspaceHint = '';
  let inputMinHeight = 52;
  let lines: ChatLine[] = [];
  let inputValue = '';
  let editingId: string | null = null;
  let editDraft = '';

  let logEl: HTMLDivElement | undefined;
  let splitterDragging = false;
  let dragStartY = 0;
  let dragStartHeight = 0;

  function post(msg: unknown): void {
    vscode.postMessage(msg);
  }

  function mergeLines(next: ChatLine[] | undefined, append: ChatLine[] | undefined): void {
    if (next) {
      lines = next;
      return;
    }
    if (append?.length) {
      lines = [...lines, ...append];
    }
  }

  function applyPatch(p: ChatPatchPayload): void {
    if (p.roleName != null) roleName = p.roleName;
    if (p.roleOptions != null) roleOptions = p.roleOptions;
    if (p.currentRoleId != null) currentRoleId = p.currentRoleId;
    if (p.roleSwitching != null) roleSwitching = !!p.roleSwitching;
    if (p.portraitPaneHeight != null) {
      portraitPaneHeight = Math.max(PORTRAIT_MIN, Math.min(portraitMax(), Number(p.portraitPaneHeight)));
    }
    if (p.portraitSrc != null) portraitSrc = p.portraitSrc;
    if (p.portraitEmoji != null) portraitEmoji = p.portraitEmoji;
    if (p.emotion != null) emotion = p.emotion;
    if (p.identityLabel != null) identityLabel = p.identityLabel;
    if (p.connectionSummary != null) connectionSummary = p.connectionSummary;
    if (p.llmSummary != null) llmSummary = p.llmSummary;
    if (p.editorChip != null) editorChip = p.editorChip;
    if (p.inputMinHeight != null) inputMinHeight = Number(p.inputMinHeight);
    if (p.sending != null) sending = !!p.sending;
    if (p.thinkingSeconds != null) thinkingSeconds = Number(p.thinkingSeconds);
    if (p.sessionOptions != null) sessionOptions = p.sessionOptions;
    if (p.currentSessionId != null) currentSessionId = p.currentSessionId;
    if (p.workspaceHint != null) workspaceHint = p.workspaceHint;
    if (p.streamingReply !== undefined) streamingReply = p.streamingReply;
    mergeLines(p.lines, p.appendLines);
  }

  function openSettingsSection(section: SettingsSection): void {
    post({ type: 'openSettings', section });
  }

  function send(): void {
    if (sending) {
      post({ type: 'stopGeneration' });
      return;
    }
    const text = inputValue.trim();
    if (!text) return;
    post({ type: 'send', text });
    inputValue = '';
  }

  function canUndo(): boolean {
    return lines.some((l) => l.role === 'user' || l.role === 'assistant');
  }

  function startEdit(line: ChatLine): void {
    if (!line.id || line.role !== 'user' || sending) return;
    editingId = line.id;
    editDraft = line.text;
  }

  function cancelEdit(): void {
    editingId = null;
    editDraft = '';
  }

  function submitEdit(): void {
    if (!editingId || !editDraft.trim() || sending) return;
    post({ type: 'editResend', messageId: editingId, newText: editDraft.trim() });
    editingId = null;
    editDraft = '';
  }

  function deleteLine(line: ChatLine): void {
    if (!line.id || sending) return;
    post({ type: 'deleteMessage', messageId: line.id });
  }

  function onRoleChange(e: Event): void {
    const sel = e.currentTarget as HTMLSelectElement;
    const roleId = sel.value;
    if (roleId && !roleSwitching) {
      post({ type: 'selectRole', roleId });
    }
  }

  function onSplitterDown(e: PointerEvent): void {
    splitterDragging = true;
    dragStartY = e.clientY;
    dragStartHeight = portraitPaneHeight;
    (e.currentTarget as HTMLElement).classList.add('dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  }

  function onSplitterMove(e: PointerEvent): void {
    if (!splitterDragging) return;
    const delta = e.clientY - dragStartY;
    portraitPaneHeight = Math.max(PORTRAIT_MIN, Math.min(portraitMax(), dragStartHeight + delta));
  }

  function endSplitterDrag(e: PointerEvent): void {
    if (!splitterDragging) return;
    splitterDragging = false;
    const el = e.currentTarget as HTMLElement;
    el.classList.remove('dragging');
    document.body.style.cursor = '';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    post({ type: 'resizePortraitPane', height: portraitPaneHeight });
  }

  function onPortraitError(): void {
    portraitSrc = '';
  }

  export function handleHostPatch(payload: ChatPatchPayload): void {
    applyPatch(payload);
  }

  export function notifyShellReady(): void {
    post({ type: 'shellReady' });
  }

  onMount(() => {
    post({ type: 'shellReady' });
  });

  afterUpdate(() => {
    if (logEl) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  });
  function onSessionChange(e: Event): void {
    const sel = e.currentTarget as HTMLSelectElement;
    const sessionId = sel.value;
    if (sessionId && sessionId !== currentSessionId && !sending) {
      post({ type: 'switchSession', sessionId });
    }
  }
</script>

<div class="chat">
  <div class="action-bar">
    <button type="button" class="btn btn-primary" title="新对话" on:click={() => post({ type: 'newChat' })}>
      <span aria-hidden="true">＋</span> 新对话
    </button>
    <select
      class="session-select"
      title="历史会话"
      disabled={sending || sessionOptions.length === 0}
      value={currentSessionId || sessionOptions[0]?.id || ''}
      on:change={onSessionChange}
    >
      {#if sessionOptions.length === 0}
        <option value="">当前会话</option>
      {:else}
        {#each sessionOptions as opt (opt.id)}
          <option value={opt.id}>{opt.label}</option>
        {/each}
      {/if}
    </select>
    <button
      type="button"
      class="btn btn-secondary"
      title="重连内核"
      disabled={sending}
      on:click={() => post({ type: 'reconnectKernel' })}
    >
      <span aria-hidden="true">↻</span> 重连
    </button>
    <select
      class="role-select"
      title="切换角色"
      disabled={roleSwitching || roleOptions.length === 0}
      value={currentRoleId || roleOptions[0]?.id || ''}
      on:change={onRoleChange}
    >
      {#if roleOptions.length === 0}
        <option value="">无角色</option>
      {:else}
        {#each roleOptions as opt (opt.id)}
          <option value={opt.id}>{opt.name || opt.id}</option>
        {/each}
      {/if}
    </select>
    <button
      type="button"
      class="btn btn-secondary"
      title="将最近一轮对话记入工作区日记"
      disabled={sending}
      on:click={() => post({ type: 'appendDiary' })}
    >
      <span aria-hidden="true">📓</span> 记入日记
    </button>
    <button
      type="button"
      class="btn btn-secondary"
      title="写一封信到 .oclive/letters/"
      disabled={sending}
      on:click={() => post({ type: 'writeLetter' })}
    >
      <span aria-hidden="true">✉</span> 写信
    </button>
    <button type="button" class="btn btn-secondary" title="设置" on:click={() => post({ type: 'openSettings' })}>
      <span aria-hidden="true">⚙</span> 设置
    </button>
  </div>

  <div class="portrait-pane" style="height: {portraitPaneHeight}px">
    <div class="portrait-frame">
      {#if portraitSrc}
        <img src={portraitSrc} alt="" on:error={onPortraitError} />
      {:else}
        <span class="portrait-fallback">{portraitEmoji}</span>
      {/if}
    </div>
    <div class="portrait-meta">
      <span class="meta-name">{roleName}</span>
      <span class="emotion-line">
        <span class="emotion-emoji">{portraitEmoji}</span>
        <span>{emotion}</span>
      </span>
    </div>
  </div>

  <div
    class="splitter"
    role="separator"
    aria-orientation="horizontal"
    aria-label="调整立绘区高度"
    on:pointerdown={onSplitterDown}
    on:pointermove={onSplitterMove}
    on:pointerup={endSplitterDrag}
    on:pointercancel={endSplitterDrag}
  ></div>

  <div class="meta-row">
    {#if workspaceHint}
      <span class="meta-chip static workspace-hint" title="工作区提示">{workspaceHint}</span>
    {/if}
    {#if identityLabel}
      <button type="button" class="meta-chip" on:click={() => openSettingsSection('identity')}>
        身份 · {identityLabel}
      </button>
    {/if}
    {#if llmSummary}
      <button type="button" class="meta-chip" on:click={() => openSettingsSection('model')}>
        模型 · {llmSummary}
      </button>
    {/if}
    {#if connectionSummary}
      <button type="button" class="meta-chip" on:click={() => openSettingsSection('kernel')}>
        连接 · {connectionSummary}
      </button>
    {/if}
    {#if editorChip}
      <span class="meta-chip static" title="编辑器上下文">📄 {editorChip}</span>
    {/if}
  </div>

  <div class="log" bind:this={logEl}>
    {#each lines as line, i (line.id ?? `line-${i}`)}
      <div class="msg-wrap {line.role}">
        {#if editingId === line.id}
          <div class="edit-box">
            <textarea bind:value={editDraft} rows="3"></textarea>
            <div class="edit-actions">
              <button type="button" class="btn-mini" on:click={submitEdit}>重发</button>
              <button type="button" class="btn-mini secondary" on:click={cancelEdit}>取消</button>
            </div>
          </div>
        {:else}
          <div class="msg {line.role}">
            {line.text}
            {#if line.dismissible}
              <button type="button" class="dismiss-hint" on:click={() => post({ type: 'dismissHint' })}>
                知道了
              </button>
            {/if}
          </div>
          {#if line.id && (line.role === 'user' || line.role === 'assistant')}
            <div class="msg-actions">
              {#if line.role === 'user'}
                <button
                  type="button"
                  class="msg-action"
                  title="编辑并重发（不回退记忆）"
                  disabled={sending}
                  on:click={() => startEdit(line)}
                >改</button>
              {/if}
              <button
                type="button"
                class="msg-action"
                title="删除此条（不回退记忆）"
                disabled={sending}
                on:click={() => deleteLine(line)}
              >删</button>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
    {#if sending}
      {#if streamingReply}
        <div class="msg assistant streaming">{streamingReply}<span class="cursor">▍</span></div>
      {/if}
      <div class="sending">
        <span class="dot-pulse" aria-hidden="true"></span>
        思考中… {thinkingSeconds}s
        {#if thinkingSeconds >= 8}
          <span class="cold-hint">（本地 7B 首次需加载模型，请稍候）</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="footer">
    <div class="turn-actions">
      <button
        type="button"
        class="btn-mini secondary"
        disabled={sending || !canUndo()}
        title="撤回最后一轮（不回退记忆）"
        on:click={() => post({ type: 'undoTurn' })}
      >撤回上一轮</button>
      <button
        type="button"
        class="btn-mini secondary"
        disabled={sending || !canUndo()}
        title="重新生成最后回复"
        on:click={() => post({ type: 'regenerate' })}
      >重新生成</button>
    </div>
    <div class="row">
      <textarea
        bind:value={inputValue}
        placeholder="Message…"
        style="min-height: {inputMinHeight}px"
        disabled={sending}
        on:keydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      ></textarea>
      <button class="send {sending ? 'stop' : ''}" on:click={send}>{sending ? '停止' : '发送'}</button>
    </div>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .action-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    min-height: 40px;
    border-bottom: 1px solid var(--vscode-widget-border, #444);
  }
  .role-select {
    flex: 1;
    min-width: 0;
    min-height: 28px;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, #3c3c3c));
    background: var(--vscode-dropdown-background, var(--vscode-input-background, #2a2a2a));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    font-size: 0.85em;
    font-weight: normal;
    font-family: inherit;
    cursor: pointer;
  }
  .role-select:hover:not(:disabled) {
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .role-select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .role-select option {
    background: var(--vscode-dropdown-background, #2a2a2a);
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
  }
  .role-select:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .session-select {
    flex: 1.2;
    min-width: 0;
    min-height: 28px;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, #3c3c3c));
    background: var(--vscode-dropdown-background, var(--vscode-input-background, #2a2a2a));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    font-size: 0.78em;
    font-family: inherit;
    cursor: pointer;
  }
  .session-select:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .workspace-hint {
    opacity: 0.85;
    font-style: italic;
    white-space: normal;
  }
  .btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    padding: 4px 10px;
    border-radius: 3px;
    font-size: 0.85em;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
  }
  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .btn-secondary {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, #555));
  }
  .btn-secondary:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.06));
  }
  .portrait-pane {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 10px 6px;
    background: var(--vscode-editor-background, var(--vscode-sideBar-background));
    border-bottom: 1px solid var(--vscode-widget-border, #444);
    overflow: hidden;
  }
  .portrait-frame {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .portrait-frame img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center bottom;
    animation: avatarFadeIn 180ms ease-out;
  }
  .portrait-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    font-size: 56px;
    line-height: 1;
  }
  .portrait-meta {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 4px;
    max-width: 100%;
  }
  .meta-name {
    font-weight: 600;
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .emotion-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8em;
    opacity: 0.85;
  }
  .emotion-emoji {
    font-size: 1.1em;
    line-height: 1;
  }
  .splitter {
    flex-shrink: 0;
    height: 5px;
    cursor: row-resize;
    background: var(--vscode-widget-border, #444);
    touch-action: none;
    user-select: none;
  }
  .splitter:hover,
  .splitter.dragging {
    background: var(--vscode-focusBorder, #007fd4);
  }
  .meta-row {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
    font-size: 0.72em;
  }
  .meta-chip {
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.25));
    color: var(--vscode-badge-foreground, inherit);
    border: none;
    border-radius: 10px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-chip:hover:not(.static) {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.08));
  }
  .meta-chip.static {
    cursor: default;
    opacity: 0.75;
  }
  .log {
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    padding: 8px;
  }
  .msg-wrap {
    position: relative;
    margin-bottom: 6px;
  }
  .msg-wrap:hover .msg-actions {
    opacity: 1;
  }
  .msg {
    padding: 6px 8px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.92em;
  }
  .msg-wrap.user .msg {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
  }
  .msg-wrap.assistant .msg,
  .msg.assistant {
    background: transparent;
    border-left: 2px solid var(--vscode-textLink-foreground, #3794ff);
    padding-left: 10px;
  }
  .msg-wrap.system .msg {
    opacity: 0.75;
    font-size: 0.85em;
    font-style: italic;
  }
  .msg.streaming .cursor {
    animation: blink 1s step-end infinite;
  }
  .msg-actions {
    display: flex;
    gap: 4px;
    padding: 2px 8px 0;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .msg-action {
    font-size: 0.72em;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--vscode-widget-border, #555);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .msg-action:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .edit-box textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 6px;
    font-family: inherit;
    font-size: 0.92em;
  }
  .edit-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .dismiss-hint {
    margin-left: 8px;
    font-size: inherit;
    cursor: pointer;
    background: none;
    border: none;
    color: inherit;
    padding: 0;
  }
  .sending {
    padding: 4px 8px;
    font-size: 0.85em;
    opacity: 0.85;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cold-hint {
    opacity: 0.8;
    font-size: 0.92em;
  }
  .dot-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--vscode-textLink-foreground, #3794ff);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .footer {
    flex-shrink: 0;
    padding: 8px;
    border-top: 1px solid var(--vscode-widget-border, #444);
  }
  .turn-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }
  .btn-mini {
    font-size: 0.75em;
    padding: 3px 8px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
  }
  .btn-mini.secondary {
    background: transparent;
    border: 1px solid var(--vscode-widget-border, #555);
    color: inherit;
  }
  .btn-mini:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  textarea {
    flex: 1;
    max-height: 160px;
    resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 6px;
    font-family: inherit;
    font-size: 0.92em;
  }
  .send {
    align-self: flex-end;
    padding: 6px 12px;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
  }
  .send.stop {
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-inputValidation-errorForeground, #fff);
  }
  .send:disabled {
    opacity: 0.5;
    cursor: default;
  }
  @keyframes avatarFadeIn {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1); }
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
</style>
