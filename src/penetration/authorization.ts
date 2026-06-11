import * as vscode from 'vscode';

const GRANTED_WORKSPACES_KEY = 'oclive.penetration.grantedWorkspaces';
const GITIGNORE_PROMPTED_KEY = 'oclive.penetration.gitignorePrompted';

function workspaceKey(folder: vscode.WorkspaceFolder): string {
  return folder.uri.toString();
}

export async function ensureWorkspaceWriteAuthorized(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
): Promise<boolean> {
  const granted = context.globalState.get<string[]>(GRANTED_WORKSPACES_KEY, []);
  if (granted.includes(workspaceKey(folder))) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    `OCLive 将在工作区写入角色渗透文件（如 .oclive/）。是否允许写入「${folder.name}」？`,
    { modal: true },
    '允许',
    '拒绝',
  );
  if (choice !== '允许') {
    return false;
  }
  await context.globalState.update(GRANTED_WORKSPACES_KEY, [...granted, workspaceKey(folder)]);
  return true;
}

export async function maybePromptGitignore(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
): Promise<void> {
  const prompted = context.globalState.get<string[]>(GITIGNORE_PROMPTED_KEY, []);
  const key = workspaceKey(folder);
  if (prompted.includes(key)) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    '是否将 `.oclive/` 加入工作区 .gitignore？（推荐，避免私人日记误提交）',
    '加入 .gitignore',
    '稍后',
  );
  await context.globalState.update(GITIGNORE_PROMPTED_KEY, [...prompted, key]);
  if (choice !== '加入 .gitignore') {
    return;
  }
  const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
  const entry = '.oclive/';
  try {
    let existing = '';
    try {
      const buf = await vscode.workspace.fs.readFile(gitignoreUri);
      existing = Buffer.from(buf).toString('utf8');
    } catch {
      /* new file */
    }
    if (existing.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === '.oclive')) {
      void vscode.window.showInformationMessage('`.oclive/` 已在 .gitignore 中');
      return;
    }
    const next = existing.length && !existing.endsWith('\n') ? `${existing}\n${entry}\n` : `${existing}${entry}\n`;
    await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(next, 'utf8'));
    void vscode.window.showInformationMessage('已将 `.oclive/` 加入 .gitignore');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void vscode.window.showWarningMessage(`无法更新 .gitignore：${msg}`);
  }
}
