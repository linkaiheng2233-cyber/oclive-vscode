import * as vscode from 'vscode';

/** Read-only one-liner in integrated terminal (no shell execution). */
export function showTerminalLine(text: string, roleName?: string): void {
  const label = roleName?.trim() ? `OCLive · ${roleName}` : 'OCLive';
  const term = vscode.window.createTerminal({ name: label, hideFromUser: false });
  term.show(true);
  term.sendText(text, false);
}
