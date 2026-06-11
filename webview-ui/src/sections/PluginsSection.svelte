<script lang="ts">

  const PENETRATION_EXT_ID = 'oclive.oclive-vscode-penetration';
  const MIGRATION_DOC =
    'https://github.com/linkaiheng2233-cyber/oclive-vscode/blob/main/docs/MIGRATION_0.3_to_0.4.md';
</script>

<h2 class="title">插件</h2>
<p class="hint">
  OCLive 核心扩展提供<strong>角色聊天平台</strong>；日记、写信、idle 等渗透能力由<strong>可选插件</strong>提供。
  未安装渗透插件时 Chat 顶栏不会出现相关按钮。
</p>

<div class="card">
  <h3>官方渗透插件</h3>
  <p>
    扩展 ID：<code>{PENETRATION_EXT_ID}</code>
  </p>
  <p>
    安装后可恢复 0.3.x 的日记、写信、终端一行、idle 提醒与 C2 记忆同步。
    命令前缀为 <code>oclive-penetration.*</code>（0.4 起无旧命令 shim）。
  </p>
  <p>
    <a href={MIGRATION_DOC} target="_blank" rel="noopener">0.3 → 0.4 迁移说明</a>
  </p>
</div>

<div class="card">
  <h3>第三方渗透插件</h3>
  <p>
    基于 npm 包 <code>@oclive/vscode-host</code> 订阅 <code>onChatTurnCompleted</code>、
    <code>registerChatToolbarAction</code> 等宿主 API。详见仓库 <code>docs/PENETRATION_PLUGIN_AUTHOR.md</code>。
  </p>
</div>

<style>
  .title {
    margin: 0 0 8px;
    font-size: 1.05em;
  }
  .hint {
    opacity: 0.9;
    font-size: 0.88em;
    line-height: 1.45;
    margin: 0 0 12px;
  }
  .card {
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 10px;
    font-size: 0.88em;
    line-height: 1.45;
  }
  .card h3 {
    margin: 0 0 6px;
    font-size: 0.95em;
  }
  .card p {
    margin: 0 0 6px;
  }
  .card p:last-child {
    margin-bottom: 0;
  }
  a {
    color: var(--vscode-textLink-foreground);
  }
</style>
