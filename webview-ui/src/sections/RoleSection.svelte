<script lang="ts">
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;

  $: roleId = String(state.currentRoleId ?? state.config.roleId ?? '');
  $: binding = state.roleInfo?.identity_binding;
</script>

<h2 class="title">角色</h2>
<p class="row"><strong>rolesDir</strong></p>
<p class="mono">{state.config.rolesDir || '（未配置）'}</p>
{#if state.roleInfo}
  <p class="row">
    当前：<strong>{state.roleInfo.role_name}</strong> · v{state.roleInfo.version}
    <span class="mono">({state.roleInfo.role_id})</span>
  </p>
  {#if binding}
    <p class="row">身份绑定：<code>{binding}</code></p>
  {/if}
{:else if roleId}
  <p class="row">当前角色 ID：<span class="mono">{roleId}</span></p>
{:else}
  <p class="hint">未在 rolesDir 下找到角色包</p>
{/if}
<p class="hint">切换角色请用聊天顶部的角色下拉。</p>

<style>
  .title { font-size: 1em; margin: 0 0 10px; font-weight: 600; }
  .row { margin: 6px 0 2px; font-size: 0.85em; opacity: 0.85; }
  .mono { font-family: var(--vscode-editor-font-family); font-size: 0.85em; word-break: break-all; }
  .hint { font-size: 0.85em; opacity: 0.75; margin-top: 8px; }
</style>
