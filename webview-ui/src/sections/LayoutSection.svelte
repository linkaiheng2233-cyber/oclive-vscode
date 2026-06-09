<script lang="ts">
  import type { OcliveSettingsKey, SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let portraitMaxHeight = 0;
  let inputMinHeight = 52;

  $: portraitMaxHeight = Number(state.config['chat.portraitMaxHeight'] ?? 0);
  $: inputMinHeight = Number(state.config['chat.inputMinHeight'] ?? 52);

  function update(key: OcliveSettingsKey, value: unknown): void {
    post({ type: 'updateConfig', key, value });
  }
</script>

<h2 class="title">布局</h2>
<p class="hint">布局项写入 VS Code 设置；Chat 侧栏宽度仍由 VS Code 边缘拖动调节。</p>

<label class="field">
  <span>立绘最大高度（px，0 = 隐藏）</span>
  <input
    type="number"
    min="0"
    max="400"
    bind:value={portraitMaxHeight}
    on:change={() => update('chat.portraitMaxHeight', portraitMaxHeight)}
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
  input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
    max-width: 120px;
  }
  .hint { font-size: 0.85em; opacity: 0.75; margin-bottom: 8px; }
</style>
