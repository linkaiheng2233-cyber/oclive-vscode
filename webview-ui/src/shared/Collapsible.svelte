<script lang="ts">
  export let title: string;
  export let open = true;
</script>

<details class="section" bind:open>
  <summary>{title}</summary>
  <div class="body">
    <slot />
  </div>
</details>

<style>
  .section {
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 4px;
    margin-bottom: 8px;
    background: var(--vscode-editor-background);
  }
  summary {
    cursor: pointer;
    padding: 8px 10px;
    font-weight: 600;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .body {
    padding: 8px 10px 10px;
    border-top: 1px solid var(--vscode-widget-border, #444);
  }
</style>
