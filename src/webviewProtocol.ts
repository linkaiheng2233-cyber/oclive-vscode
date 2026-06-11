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
  /** Non-blocking hint when no workspace folder (penetration). */
  workspaceHint?: string;
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
  | 'penetration.enabled'
  | 'penetration.diaryPath'
  | 'penetration.autoDiaryEveryNTurns'
  | 'penetration.allowedGlobs'
  | 'penetration.previewAfterWrite'
  | 'penetration.terminal.enabled'
  | 'penetration.idle.enabled'
  | 'penetration.idle.seconds'
  | 'penetration.idle.dailyLimit'
  | 'penetration.memorySync.enabled'
  | 'penetration.memorySync.importance';

export type SettingsSection =
  | 'role'
  | 'identity'
  | 'kernel'
  | 'editor'
  | 'model'
  | 'layout'
  | 'penetration'
  | 'advanced';

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
  | { type: 'appendDiary' }
  | { type: 'writeLetter' }
  | { type: 'reconnectKernel' }
  | { type: 'switchSession'; sessionId: string }
  | { type: 'syncDiaryMemory' }
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
  | { type: 'navigateSection'; section: SettingsSection };

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
    };
