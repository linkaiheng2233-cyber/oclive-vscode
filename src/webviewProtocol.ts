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
  | 'kernelBinary'
  | 'includeEditorContext'
  | 'mockLlm'
  | 'penetration.letterEnabled'
  | 'penetration.heartVoiceEnabled';

export type SettingsSection =
  | 'role'
  | 'identity'
  | 'kernel'
  | 'editor'
  | 'model'
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
  roleIds: string[];
  sharedAppData: string;
  initialSection?: SettingsSection;
}

/** Webview → extension host */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'updateConfig'; key: OcliveSettingsKey; value: unknown }
  | { type: 'selectRole'; roleId: string }
  | { type: 'setIdentity'; identityId: string }
  | { type: 'reconnectKernel' }
  | { type: 'saveLlmSettings'; ollamaBaseUrl: string; ollamaModel?: string | null }
  | { type: 'setSessionModel'; model: string | null }
  | { type: 'reloadLlm' }
  | { type: 'navigateSection'; section: SettingsSection };

/** Extension host → webview */
export type HostToWebviewMessage =
  | { type: 'state'; payload: SettingsStateSnapshot }
  | { type: 'toast'; level: 'info' | 'error'; message: string };
