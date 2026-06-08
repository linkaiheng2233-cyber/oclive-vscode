/**
 * Kernel binary manifest — align with
 * `oclivenewnew/crates/oclive_kernel_runtime/src/kernel_manifest.rs`
 */

export interface KernelBinaryManifest {
  version: string;
  buildProfile: string;
  featureSet: string[];
  builtAt: string;
  gitCommit?: string | null;
  runtimeApiVersion?: string;
}

export const MANIFEST_NAME = 'oclive-kernel-server.oclive-manifest.json';

export const FULL_FEATURE_SET: readonly string[] = [
  'chat',
  'role_load',
  'memory',
  'emotion',
  'event',
  'prompt',
  'llm',
  'agent',
  'complex_emotion',
  'http_api',
];

export const BUNDLED_FEATURE_SET: readonly string[] = [
  'chat',
  'role_load',
  'memory',
  'ollama_llm',
];

/** Raw JSON from `/health` (snake_case serde aliases tolerated). */
export type KernelManifestJson = {
  version?: string;
  build_profile?: string;
  buildProfile?: string;
  feature_set?: string[];
  featureSet?: string[];
  built_at?: string;
  builtAt?: string;
  git_commit?: string | null;
  gitCommit?: string | null;
  runtime_api_version?: string;
  runtimeApiVersion?: string;
};

export function normalizeManifest(raw: KernelManifestJson | KernelBinaryManifest): KernelBinaryManifest {
  if ('featureSet' in raw && Array.isArray(raw.featureSet)) {
    return raw as KernelBinaryManifest;
  }
  const j = raw as KernelManifestJson;
  const buildProfile = (j.buildProfile ?? j.build_profile ?? 'full').trim();
  const featureSet =
    j.featureSet ?? j.feature_set ?? defaultFeatureSet(buildProfile);
  return {
    version: j.version ?? '0.0.0',
    buildProfile,
    featureSet: [...featureSet],
    builtAt: j.builtAt ?? j.built_at ?? '',
    gitCommit: j.gitCommit ?? j.git_commit ?? null,
    runtimeApiVersion: j.runtimeApiVersion ?? j.runtime_api_version,
  };
}

export function defaultFeatureSet(buildProfile: string): string[] {
  if (buildProfile.toLowerCase() === 'bundled') {
    return [...BUNDLED_FEATURE_SET];
  }
  return [...FULL_FEATURE_SET];
}
