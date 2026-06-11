import type { ChatToolbarActionSnapshot } from '@oclive/vscode-host';

export type { ChatToolbarActionSnapshot } from '@oclive/vscode-host';
import type { KernelHealthJson, KernelMode } from './kernelClient';
import type { LlmUserSettings } from './types/llmSettings';
import type { RoleInfo } from './types/roleInfo';
import type { UserIdentityStateResponse } from './kernelClient';

export type AppView = 'chat' | 'settings';

export interface ChatLine {
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** SQLite message id when loaded from kernel storage. */
  id?: string;
  dismissible?: boolean;
}

export interface RoleOptionSnapshot {
  id: string;
  name: string;
}

export interface SessionOptionSnapshot {
  id: string;
  label: string;
}

export interface ChatPatchPayload {
  roleName?: string;
  roleOptions?: RoleOptionSnapshot[];
  currentRoleId?: string;
  roleSwitching?: boolean;
  portraitSrc?: string;
  portraitEmoji?: string;
  portraitPaneHeight?: number;
  emotion?: string;
  identityLabel?: string;
  connectionSummary?: string;
  llmSummary?: string;
  editorChip?: string;
  sending?: boolean;
  inputMinHeight?: number;
  /** Full replace of the conversation log (bootstrap, new chat, role switch). */
  lines?: ChatLine[];
  /** Append-only delta; webview merges without rebuilding prior rows. */
  appendLines?: ChatLine[];
  /** In-progress assistant reply during SSE streaming; `null` clears the bubble. */
  streamingReply?: string | null;
  /** Elapsed seconds while waiting for LLM (loading animation). */
  thinkingSeconds?: number;
  /** Chat session picker (listChatSessions). */
  sessionOptions?: SessionOptionSnapshot[];
  currentSessionId?: string;
  /** Non-blocking hint when no workspace folder. */
  workspaceHint?: string;
  /** Dynamic toolbar actions registered by penetration plugins. */
  toolbarActions?: ChatToolbarActionSnapshot[];
}

/** Settings keys writable from the settings webview. */
export type OcliveSettingsKey =
  | 'apiPort'
  | 'autoDiscover'
  | 'promoteSharedKernel'
  | 'rolesDir'
  | 'roleId'
  | 'roleAllowlist'
  | 'kernelBinary'
  | 'includeEditorContext'
  | 'mockLlm'
  | 'chat.portraitPaneHeight'
  | 'chat.inputMinHeight'
  | 'settings.placement'

export type SettingsSection =
  | 'role'
  | 'identity'
  | 'kernel'
  | 'editor'
  | 'model'
  | 'layout'
  | 'storage'
  | 'plugins'
  | 'advanced';

export interface ChatStorageCapabilitiesSnapshot {
  backend_kind: string;
  supports_search: boolean;
  supports_replay: boolean;
  supports_cleanup: boolean;
}

export interface ChatStorageSessionSnapshot {
  session_id: string;
  role_id: string;
  scene_id: string;
  updated_at: string;
  message_count: number;
  last_message_snippet: string;
}

export interface ChatStorageSearchHit {
  message_id: string;
  session_id: string;
  content: string;
  created_at: string;
}

export interface SettingsDiscoverySnapshot {
  rolesDir: string;
  kernelBinary: string;
  kernelFallbackBinary?: string;
}

export type SettingsHealthSnapshot = KernelHealthJson;

export interface SettingsStateSnapshot {
  config: Record<string, unknown>;
  kernelMode: KernelMode;
  roleInfo: RoleInfo | null;
  identityState: UserIdentityStateResponse | null;
  health: SettingsHealthSnapshot | null;
  discovery: SettingsDiscoverySnapshot;
  llmSettings: LlmUserSettings | null;
  ollamaModels: string[];
  roleOptions: RoleOptionSnapshot[];
  currentRoleId: string;
  sharedAppData: string;
  initialSection?: SettingsSection;
}

/** Webview → extension host */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'shellReady' }
  | { type: 'closeSettings' }
  | { type: 'openSettings'; section?: SettingsSection }
  | { type: 'send'; text: string }
  | { type: 'stopGeneration' }
  | { type: 'undoTurn' }
  | { type: 'regenerate' }
  | { type: 'editResend'; messageId: string; newText: string }
  | { type: 'deleteMessage'; messageId: string }
  | { type: 'toolbarAction'; command: string }
  | { type: 'reconnectKernel' }
  | { type: 'switchSession'; sessionId: string }
  | { type: 'newChat' }
  | { type: 'selectRole'; roleId: string }
  | { type: 'resizePortraitPane'; height: number }
  | { type: 'dismissHint' }
  | { type: 'updateConfig'; key: OcliveSettingsKey; value: unknown }
  | { type: 'setIdentity'; identityId: string }
  | { type: 'rediscover' }
  | {
      type: 'saveLlmSettings';
      provider: 'local' | 'cloud';
      ollamaBaseUrl?: string;
      ollamaModel?: string | null;
      remoteUrl?: string;
      remoteToken?: string;
      remoteModel?: string;
      cloudApiStyle?: 'openai' | 'oclive_jsonrpc';
    }
  | { type: 'setSessionModel'; model: string | null; provider: 'local' | 'cloud' }
  | { type: 'refreshOllamaModels'; ollamaBaseUrl?: string }
  | { type: 'reloadLlm' }
  | { type: 'navigateSection'; section: SettingsSection }
  | { type: 'loadStorageState' }
  | { type: 'searchStorage'; query: string }
  | {
      type: 'exportStorage';
      kind: 'session' | 'role';
      format: 'markdown' | 'json';
      sessionId?: string;
    };

/** Extension host → webview */
export type HostToWebviewMessage =
  | { type: 'view'; view: AppView; initialSection?: SettingsSection }
  | { type: 'chatPatch'; payload: ChatPatchPayload }
  | { type: 'state'; payload: SettingsStateSnapshot }
  | { type: 'toast'; level: 'info' | 'error'; message: string }
  | { type: 'ollamaModelsResult'; models: string[]; error?: string }
  | {
      type: 'llmOperationDone';
      op: 'save' | 'refresh' | 'sessionModel';
      ok: boolean;
      message?: string;
    }
  | {
      type: 'storageState';
      capabilities: ChatStorageCapabilitiesSnapshot | null;
      sessions: ChatStorageSessionSnapshot[];
      error?: string;
    }
  | {
      type: 'storageSearchResult';
      hits: ChatStorageSearchHit[];
      error?: string;
    };
