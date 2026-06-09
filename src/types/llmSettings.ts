export interface LlmUserSettings {
  provider: string;
  cloudVendor: string;
  cloudApiStyle: string;
  ollamaBaseUrl: string;
  ollamaReachable: boolean;
  ollamaDetail: string;
  localModelsDir: string;
  packOllamaModel: string | null;
  sessionOllamaModel: string | null;
  effectiveModel: string;
  remoteUrl: string;
  remoteTokenConfigured: boolean;
  remoteModel: string;
  remoteUrlEnvActive: boolean;
  remoteTokenEnvActive: boolean;
}

export interface SaveLlmUserSettingsRequest {
  roleId: string;
  sessionId?: string | null;
  provider: 'local' | 'cloud';
  cloudApiStyle?: 'openai' | 'oclive_jsonrpc';
  ollamaBaseUrl?: string;
  ollamaModel?: string | null;
  remoteUrl?: string;
  remoteToken?: string;
  remoteModel?: string;
}
