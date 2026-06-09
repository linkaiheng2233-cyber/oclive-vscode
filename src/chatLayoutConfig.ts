import * as vscode from 'vscode';

export const PORTRAIT_PANE_HEIGHT_DEFAULT = 180;
export const PORTRAIT_PANE_HEIGHT_MIN = 96;
export const PORTRAIT_PANE_HEIGHT_MAX = 420;

export function clampPortraitPaneHeight(h: number): number {
  return Math.max(
    PORTRAIT_PANE_HEIGHT_MIN,
    Math.min(PORTRAIT_PANE_HEIGHT_MAX, Math.round(h)),
  );
}

/** Resolve pane height: new key SSOT, legacy portraitMaxHeight mapped when unset. */
export function resolvePortraitPaneHeight(cfg: vscode.WorkspaceConfiguration): number {
  const explicit = cfg.get<number>('chat.portraitPaneHeight');
  if (explicit != null && explicit > 0) {
    return clampPortraitPaneHeight(explicit);
  }
  const legacy = Number(cfg.get('chat.portraitMaxHeight') ?? 32);
  if (legacy <= 32) {
    return PORTRAIT_PANE_HEIGHT_DEFAULT;
  }
  return clampPortraitPaneHeight(legacy);
}
