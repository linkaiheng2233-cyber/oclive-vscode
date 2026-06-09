<script lang="ts">
  import Select from '../shared/Select.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  let selected = String(state.config.roleId ?? '');

  $: selected = String(state.config.roleId ?? '');
  $: roleOptions = state.roleIds.map((id) => ({ value: id, label: id }));

  function onChange(): void {
    if (selected && selected !== state.config.roleId) {
      post({ type: 'selectRole', roleId: selected });
    }
  }
</script>

<h2 class="title">角色</h2>
<p class="row"><strong>rolesDir</strong></p>
<p class="mono">{state.config.rolesDir || '（未配置）'}</p>
{#if roleOptions.length}
  <Select label="当前角色" bind:value={selected} options={roleOptions} on:change={onChange} />
{:else}
  <p class="hint">未在 rolesDir 下找到角色包</p>
{/if}
{#if state.roleInfo}
  <p class="row">包名：{state.roleInfo.role_name} · v{state.roleInfo.version}</p>
{/if}

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
  .row { margin: 6px 0 2px; font-size: 0.85em; opacity: 0.85; }
  .mono { font-family: var(--vscode-editor-font-family); font-size: 0.85em; word-break: break-all; }
  .hint { font-size: 0.85em; opacity: 0.75; }
</style>
