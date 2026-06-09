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
