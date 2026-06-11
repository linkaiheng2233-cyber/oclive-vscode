import * as vscode from 'vscode';

import {
  HOST_API_VERSION,
  type ChatToolbarAction,
  type ChatToolbarActionSnapshot,
  type ChatHistoryEntry,
  type ChatTurnCompletedEvent,
  type ChatTurnSnapshot,
  type EditorContextSnapshot,
  type KernelClientFacade,
  type KernelDisconnectedEvent,
  type KernelReadyEvent,
  type OcliveHostApi,
  type WorkspaceWriteRequest,
  type WorkspaceWriteResult,
} from '@oclive/vscode-host';

import type { KernelClient } from '../kernelClient';
import { getEffectiveConfig } from '../runtimeConfig';
import { rolePackPath } from '../config';
import { requestWorkspaceWrite } from './workspaceWrite';

export interface HostApiDeps {
  getEditorContext: () => EditorContextSnapshot;
  getRecentTurn: () => ChatTurnSnapshot | undefined;
  getSessionId: () => string;
  getRoleName: () => string;
}

export class OcliveHostApiImpl implements OcliveHostApi {
  readonly apiVersion = HOST_API_VERSION;

  private readonly onChatTurnCompletedEmitter = new vscode.EventEmitter<ChatTurnCompletedEvent>();
  private readonly onKernelReadyEmitter = new vscode.EventEmitter<KernelReadyEvent>();
  private readonly onKernelDisconnectedEmitter =
    new vscode.EventEmitter<KernelDisconnectedEvent>();
  private readonly toolbarActions = new Map<string, ChatToolbarActionSnapshot>();
  private readonly toolbarListeners = new Set<() => void>();

  readonly onChatTurnCompleted = this.onChatTurnCompletedEmitter.event;
  readonly onKernelReady = this.onKernelReadyEmitter.event;
  readonly onKernelDisconnected = this.onKernelDisconnectedEmitter.event;

  private deps: HostApiDeps;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly kernel: KernelClient,
    deps: HostApiDeps,
  ) {
    this.deps = deps;
  }

  setDeps(deps: HostApiDeps): void {
    this.deps = deps;
  }

  getEditorContext(): EditorContextSnapshot {
    return this.deps.getEditorContext();
  }

  getRolePackPath(): string | undefined {
    const eff = getEffectiveConfig();
    if (!eff.rolesDir) {
      return undefined;
    }
    try {
      return rolePackPath(eff);
    } catch {
      return undefined;
    }
  }

  getRecentTurn(): ChatTurnSnapshot | undefined {
    return this.deps.getRecentTurn();
  }

  async getChatHistory(sessionId?: string, limit = 50): Promise<ChatHistoryEntry[]> {
    const eff = getEffectiveConfig();
    const sid = sessionId?.trim() || this.deps.getSessionId();
    if (!sid) {
      return [];
    }
    const cap = Math.min(Math.max(limit, 1), 500);
    const rows = await this.kernel.fetchChatMessages(sid, eff, cap, 0);
    return rows.map((m) => ({
      id: m.id,
      role: m.sender === 'user' ? 'user' : m.sender === 'assistant' ? 'assistant' : 'system',
      text: m.content,
    }));
  }

  requestWorkspaceWrite(req: WorkspaceWriteRequest): Promise<WorkspaceWriteResult> {
    return requestWorkspaceWrite(this.context, req);
  }

  getKernelClient(): KernelClientFacade {
    return {
      bridgeDispatch: async (command, params) => {
        const eff = getEffectiveConfig();
        const result = await this.kernel.bridgeDispatch(command, params, eff);
        if (result.ok) {
          return { ok: true, data: result.data };
        }
        return { ok: false, error: result.error };
      },
    };
  }

  registerChatToolbarAction(action: ChatToolbarAction): vscode.Disposable {
    const snapshot: ChatToolbarActionSnapshot = {
      id: action.id,
      label: action.label,
      command: action.command,
      icon: action.icon,
      title: action.title,
    };
    this.toolbarActions.set(action.id, snapshot);
    this.notifyToolbarChanged();
    return new vscode.Disposable(() => {
      this.toolbarActions.delete(action.id);
      this.notifyToolbarChanged();
    });
  }

  onToolbarChanged(listener: () => void): vscode.Disposable {
    this.toolbarListeners.add(listener);
    return new vscode.Disposable(() => {
      this.toolbarListeners.delete(listener);
    });
  }

  getToolbarActionSnapshots(): ChatToolbarActionSnapshot[] {
    return [...this.toolbarActions.values()];
  }

  fireChatTurnCompleted(event: ChatTurnCompletedEvent): void {
    this.onChatTurnCompletedEmitter.fire(event);
  }

  fireKernelReady(event: KernelReadyEvent): void {
    this.onKernelReadyEmitter.fire(event);
  }

  fireKernelDisconnected(event: KernelDisconnectedEvent): void {
    this.onKernelDisconnectedEmitter.fire(event);
  }

  dispose(): void {
    this.onChatTurnCompletedEmitter.dispose();
    this.onKernelReadyEmitter.dispose();
    this.onKernelDisconnectedEmitter.dispose();
    this.toolbarActions.clear();
    this.toolbarListeners.clear();
  }

  private notifyToolbarChanged(): void {
    for (const listener of this.toolbarListeners) {
      listener();
    }
  }
}
