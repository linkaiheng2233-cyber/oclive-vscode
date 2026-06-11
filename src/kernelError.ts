/** Same shape as `oclive_kernel_types::KernelErrorBody` / HTTP `error` object. */
export interface KernelErrorPayload {
  code: string;
  message: string;
  hint?: string | null;
}

interface ApiErrorEnvelope {
  error: KernelErrorPayload;
}

export class KernelApiError extends Error {
  readonly code: string;
  readonly hint?: string | null;

  constructor(payload: KernelErrorPayload) {
    super(payload.message);
    this.name = 'KernelApiError';
    this.code = payload.code;
    this.hint = payload.hint;
  }
}

export type KernelResult<T> = { ok: true; data: T } | { ok: false; error: KernelErrorPayload };

/** Map kernel `code` to actionable Chinese copy for VS Code chat / toasts. */
export function formatKernelErrorForUser(payload: {
  code?: string;
  message?: string;
  hint?: string | null;
}): string {
  const code = payload.code?.trim();
  const hint = payload.hint?.trim();
  const base = payload.message?.trim() || '请求失败';

  const byCode: Record<string, string> = {
    KERNEL_OFFLINE:
      '无法连接本地内核（:8420）。请在设置 → 内核点击「重连」，或确认 oclive-kernel-server 已构建。',
    LLM_ERROR:
      '模型调用失败。请检查 Ollama 是否运行、模型是否已 pull，或在设置 → 模型中更换配置。',
    ROLE_NOT_FOUND: '角色包未找到。请在设置 → 角色检查 roles 目录与 roleId。',
    ROLE_RUNTIME_NOT_READY: '角色尚未加载。请切换角色或重连内核后再试。',
    STARTUP_HEALTH_FAILED:
      '内核启动自检未通过（槽位/数据库/模型）。请查看内核日志或设置 → 内核重连。',
    REMOTE_SERVICE_UNAVAILABLE:
      '远程 LLM 不可达。请检查网络与云端 URL，或改回本地 Ollama。',
    HIGH_RISK_CAPABILITY_NOT_GRANTED:
      '需要先授予高风险能力（如云端出站网络）。请在提示框中确认授权。',
    EMPTY_MESSAGE: '消息不能为空。',
    INVALID_ROLE_PATH: '角色路径无效。请在设置中重新选择角色库。',
    HTTP_ERROR: `网络错误：${base}`,
    INVALID_PARAMETER: `参数无效：${base}`,
    DB_ERROR: '数据库错误。可尝试重启内核；数据目录见状态栏 tooltip。',
  };

  if (code && byCode[code]) {
    return hint ? `${byCode[code]}（${hint}）` : byCode[code];
  }
  if (code) {
    return hint ? `${base} [${code}]（${hint}）` : `${base} [${code}]`;
  }
  return hint ? `${base}（${hint}）` : base;
}

export async function parseKernelErrorResponse(res: Response): Promise<KernelErrorPayload> {
  try {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return { code: 'HTTP_ERROR', message: `HTTP ${res.status}` };
    }
    const parsed = JSON.parse(trimmed) as ApiErrorEnvelope | KernelErrorPayload;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      parsed.error &&
      typeof parsed.error.code === 'string' &&
      typeof parsed.error.message === 'string'
    ) {
      return parsed.error;
    }
    if (
      typeof (parsed as KernelErrorPayload).code === 'string' &&
      typeof (parsed as KernelErrorPayload).message === 'string'
    ) {
      return parsed as KernelErrorPayload;
    }
    return { code: 'HTTP_ERROR', message: trimmed };
  } catch {
    return { code: 'HTTP_ERROR', message: `HTTP ${res.status}` };
  }
}
