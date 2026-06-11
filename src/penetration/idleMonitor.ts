import * as vscode from 'vscode';
import type { PenetrationIdleConfig } from './config';

const DAILY_COUNT_KEY = 'oclive.penetration.idleDailyCount';
const DAILY_DATE_KEY = 'oclive.penetration.idleDailyDate';

export class PenetrationIdleMonitor implements vscode.Disposable {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastActivity = Date.now();
  private subs: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getConfig: () => PenetrationIdleConfig,
    private readonly onIdle: () => void,
  ) {
    this.subs.push(
      vscode.window.onDidChangeWindowState((e) => {
        if (!e.focused) {
          this.schedule();
        } else {
          this.clearTimer();
          this.lastActivity = Date.now();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.lastActivity = Date.now();
        this.clearTimer();
      }),
    );
  }

  touch(): void {
    this.lastActivity = Date.now();
    this.clearTimer();
  }

  private schedule(): void {
    this.clearTimer();
    const cfg = this.getConfig();
    if (!cfg.enabled || cfg.seconds <= 0) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.fireIfAllowed();
    }, cfg.seconds * 1000);
  }

  private async fireIfAllowed(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      return;
    }
    if (Date.now() - this.lastActivity < cfg.seconds * 1000) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = this.context.globalState.get<string>(DAILY_DATE_KEY, '');
    let count = this.context.globalState.get<number>(DAILY_COUNT_KEY, 0);
    if (storedDate !== today) {
      count = 0;
      await this.context.globalState.update(DAILY_DATE_KEY, today);
    }
    if (cfg.dailyLimit > 0 && count >= cfg.dailyLimit) {
      return;
    }
    await this.context.globalState.update(DAILY_COUNT_KEY, count + 1);
    this.onIdle();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.clearTimer();
    for (const s of this.subs) {
      s.dispose();
    }
    this.subs = [];
  }
}
