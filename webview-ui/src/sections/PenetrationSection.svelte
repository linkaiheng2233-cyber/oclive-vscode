<script lang="ts">
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  function update(key: string, value: unknown): void {
    post({ type: 'updateConfig', key, value });
  }
</script>

<h2 class="title">渗透</h2>
<p class="hint">
  角色在工作区留痕（日记、信件等），与内核 Agent 槽正交。日记默认<strong>不</strong>自动进入长期记忆；可选手动同步。
  终端一行与 idle 提醒默认关闭——开启后由角色包 <code>penetration_templates</code> 定制文案。
</p>

<label class="row">
  <input
    type="checkbox"
    checked={!!state.config['penetration.enabled']}
    on:change={(e) => update('penetration.enabled', e.currentTarget.checked)}
  />
  启用渗透写盘
</label>

<label class="row">
  <span>日记路径模板</span>
  <input
    class="wide"
    type="text"
    value={String(state.config['penetration.diaryPath'] ?? '.oclive/{roleId}/diary.md')}
    on:change={(e) => update('penetration.diaryPath', e.currentTarget.value)}
  />
</label>

<label class="row">
  <span>每 N 轮自动记入日记（0=关）</span>
  <input
    type="number"
    min="0"
    max="100"
    value={Number(state.config['penetration.autoDiaryEveryNTurns'] ?? 0)}
    on:change={(e) => update('penetration.autoDiaryEveryNTurns', Number(e.currentTarget.value))}
  />
</label>

<label class="row">
  <input
    type="checkbox"
    checked={!!state.config['penetration.previewAfterWrite']}
    on:change={(e) => update('penetration.previewAfterWrite', e.currentTarget.checked)}
  />
  写入后预览打开日记
</label>

<label class="row">
  <input
    type="checkbox"
    checked={!!state.config['penetration.terminal.enabled']}
    on:change={(e) => update('penetration.terminal.enabled', e.currentTarget.checked)}
  />
  终端展示一行（只读；角色名会显示在终端标题）
</label>

<fieldset>
  <legend>idle 提醒</legend>
  <p class="sub-hint">失焦后由角色提醒你回来；文案可在角色包 <code>penetration_templates.idle_message</code> 配置。</p>
  <label class="row">
    <input
      type="checkbox"
      checked={!!state.config['penetration.idle.enabled']}
      on:change={(e) => update('penetration.idle.enabled', e.currentTarget.checked)}
    />
    窗口失焦 N 秒后聚焦侧栏（默认关）
  </label>
  <label class="row">
    <span>秒数</span>
    <input
      type="number"
      min="60"
      value={Number(state.config['penetration.idle.seconds'] ?? 300)}
      on:change={(e) => update('penetration.idle.seconds', Number(e.currentTarget.value))}
    />
  </label>
  <label class="row">
    <span>每日上限</span>
    <input
      type="number"
      min="0"
      value={Number(state.config['penetration.idle.dailyLimit'] ?? 3)}
      on:change={(e) => update('penetration.idle.dailyLimit', Number(e.currentTarget.value))}
    />
  </label>
</fieldset>

<fieldset>
  <legend>记忆同步（C2 · 可选）</legend>
  <label class="row">
    <input
      type="checkbox"
      checked={!!state.config['penetration.memorySync.enabled']}
      on:change={(e) => update('penetration.memorySync.enabled', e.currentTarget.checked)}
    />
    允许将今日日记摘要提交长期记忆
  </label>
  <label class="row">
    <span>重要性 (0–1)</span>
    <input
      type="number"
      min="0"
      max="1"
      step="0.1"
      value={Number(state.config['penetration.memorySync.importance'] ?? 0.6)}
      on:change={(e) => update('penetration.memorySync.importance', Number(e.currentTarget.value))}
    />
  </label>
  <button type="button" on:click={() => post({ type: 'syncDiaryMemory' })}>
    将今日日记摘要提交记忆
  </button>
</fieldset>

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
  .hint { font-size: 0.85em; opacity: 0.85; margin: 0 0 12px; line-height: 1.45; }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-size: 0.9em;
  }
  .wide {
    flex: 1 1 100%;
    min-width: 200px;
    padding: 4px 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
  }
  fieldset {
    border: 1px solid var(--vscode-widget-border);
    margin: 12px 0;
    padding: 8px 10px;
  }
  legend { font-size: 0.85em; padding: 0 4px; }
  .sub-hint {
    font-size: 0.8em;
    opacity: 0.75;
    margin: 0 0 8px;
    line-height: 1.4;
  }
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
