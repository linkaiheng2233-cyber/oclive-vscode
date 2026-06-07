<script lang="ts">
  import Collapsible from '../shared/Collapsible.svelte';
  import Select from '../shared/Select.svelte';
  import type { SettingsStateSnapshot } from '@protocol';

  export let state: SettingsStateSnapshot;
  export let post: (msg: unknown) => void;

  const DEFAULT_SENTINEL = '__oclive_default__';

  let selected = DEFAULT_SENTINEL;

  $: ids = state.identityState;
  $: binding = state.roleInfo?.identity_binding ?? 'per_scene';
  $: if (ids) {
    selected = ids.use_manifest_default ? DEFAULT_SENTINEL : ids.current_identity_id;
  }
  $: identityOptions = ids?.identities?.length
    ? [
        {
          value: DEFAULT_SENTINEL,
          label: `跟随包默认（${ids.default_identity_id}）`,
        },
        ...ids.identities.map((i) => ({
          value: i.id,
          label: i.display_name || i.id,
        })),
      ]
    : [];

  function onChange(): void {
    post({ type: 'setIdentity', identityId: selected });
  }
</script>

<Collapsible title="用户身份" open={state.initialSection === 'identity'}>
  {#if !ids?.identities?.length}
    <p class="hint">当前角色包未配置 user_identities/</p>
  {:else}
    <p class="row">绑定模式：<code>{binding}</code></p>
    <Select
      label="当前身份"
      bind:value={selected}
      options={identityOptions}
      on:change={onChange}
    />
  {/if}
</Collapsible>

<style>
  .row { font-size: 0.85em; margin-bottom: 6px; }
  .hint { font-size: 0.85em; opacity: 0.75; }
  code { font-family: var(--vscode-editor-font-family); }
</style>
