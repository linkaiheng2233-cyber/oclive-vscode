import type { KernelHealthJson, KernelMode } from './kernelClient';
import type { LlmUserSettings } from './types/llmSettings';
import type { RoleInfo } from './types/roleInfo';
import type {
  UserIdentityStateResponse,
} from './kernelClient';

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
  | 'penetration.letterEnabled'
  | 'penetration.heartVoiceEnabled'
  | 'chat.portraitMaxHeight'
  | 'chat.portraitPaneHeight'
  | 'chat.inputMinHeight'
  | 'settings.placement';

export type SettingsSection =
  | 'role'
  | 'identity'
  | 'kernel'
  | 'editor'
  | 'model'
  | 'layout'
  | 'advanced';

export interface SettingsDiscoverySnapshot {
  rolesDir: string;
  kernelBinary: string;
  kernelFallbackBinary?: string;
}

export type SettingsHealthSnapshot = KernelHealthJson;

export interface RoleOptionSnapshot {
  id: string;
  name: string;
}

export interface SettingsStateSnapshot {
  config: Record<string, unknown>;
  kernelMode: KernelMode;
  roleInfo: RoleInfo | null;
  identityState: UserIdentityStateResponse | null;
  health: SettingsHealthSnapshot | null;
  discovery: SettingsDiscoverySnapshot;
  llmSettings: LlmUserSettings | null;
  ollamaModels: string[];
  /** @deprecated Prefer roleOptions */
  roleIds: string[];
  roleOptions: RoleOptionSnapshot[];
  currentRoleId: string;
  sharedAppData: string;
  initialSection?: SettingsSection;
}

/** Webview → extension host */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'closeSettings' }
  | { type: 'updateConfig'; key: OcliveSettingsKey; value: unknown }
  | { type: 'selectRole'; roleId: string }
  | { type: 'setIdentity'; identityId: string }
  | { type: 'reconnectKernel' }
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
  | { type: 'state'; payload: SettingsStateSnapshot }
  | { type: 'toast'; level: 'info' | 'error'; message: string }
  | { type: 'ollamaModelsResult'; models: string[]; error?: string }
  | {
      type: 'llmOperationDone';
      op: 'save' | 'refresh' | 'sessionModel';
      ok: boolean;
      message?: string;
    };
