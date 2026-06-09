import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function buildWebviewHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  opts?: { maxWidthPx?: number },
): string {
  const distDir = path.join(extensionUri.fsPath, 'webview-ui', 'dist');
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:12px;color:var(--vscode-foreground)">
        <p>Webview UI 未构建。请运行 <code>npm run build:webview</code> 后重载扩展。</p>
      </body></html>`;
  }
  let html = fs.readFileSync(indexPath, 'utf8');
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  html = html.replace(/<script/g, `<script nonce="${nonce}"`);
  html = html.replace(
    /<head>/,
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );

  html = html.replace(/(href|src)="([^"]+)"/g, (_m, attr: string, url: string) => {
    if (url.startsWith('http') || url.startsWith('data:')) {
      return `${attr}="${url}"`;
    }
    const resource = vscode.Uri.joinPath(
      extensionUri,
      'webview-ui',
      'dist',
      url.replace(/^\.\//, ''),
    );
    return `${attr}="${webview.asWebviewUri(resource)}"`;
  });

  if (opts?.maxWidthPx) {
    html = html.replace(
      /<head>/,
      `<head><style>body{max-width:${opts.maxWidthPx}px;margin:0 auto;}</style>`,
    );
  }

  return html;
}
