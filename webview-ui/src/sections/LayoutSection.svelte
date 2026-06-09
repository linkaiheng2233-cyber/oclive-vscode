<script lang="ts">
  import type { OcliveSettingsKey, SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  const PORTRAIT_MIN = 96;
  const PORTRAIT_MAX = 420;

  let portraitPaneHeight = 180;
  let inputMinHeight = 52;

  $: portraitPaneHeight = Number(state.config['chat.portraitPaneHeight'] ?? 180);
  $: inputMinHeight = Number(state.config['chat.inputMinHeight'] ?? 52);

  function update(key: OcliveSettingsKey, value: unknown): void {
    post({ type: 'updateConfig', key, value });
  }
</script>

<h2 class="title">布局</h2>
<p class="hint">
  布局项写入 VS Code 设置；Chat 侧栏宽度仍由 VS Code 边缘拖动调节。立绘区高度也可在 Chat 内拖拽分界条调整。
</p>

<label class="field">
  <span>立绘区高度（{portraitPaneHeight}px，{PORTRAIT_MIN}–{PORTRAIT_MAX}）</span>
  <input
    type="range"
    min={PORTRAIT_MIN}
    max={PORTRAIT_MAX}
    step="4"
    bind:value={portraitPaneHeight}
    on:change={() => update('chat.portraitPaneHeight', portraitPaneHeight)}
  />
</label>

<label class="field">
  <span>输入框最小高度（px）</span>
  <input
    type="number"
    min="36"
    max="200"
    bind:value={inputMinHeight}
    on:change={() => update('chat.inputMinHeight', inputMinHeight)}
  />
</label>

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 8px 0;
    font-size: 0.85em;
  }
  input[type='number'] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
    max-width: 120px;
  }
  input[type='range'] {
    width: 100%;
    max-width: 280px;
  }
  .hint { font-size: 0.85em; opacity: 0.75; margin-bottom: 8px; }
</style>
