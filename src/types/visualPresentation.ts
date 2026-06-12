/** Mirrors main-app `PerformanceDirective` (additive HTTP field). */
export interface PerformanceDirective {
  visual_state_id: string;
  kind: string;
  path?: string | null;
  expression?: string | null;
  motion?: string | null;
  fallback_image?: string | null;
  live2d_model?: string | null;
  rig3d_model?: string | null;
  context?: string | null;
}

export function parsePerformanceDirective(raw: unknown): PerformanceDirective | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const id = o.visual_state_id;
  const kind = o.kind;
  if (typeof id !== 'string' || !id.length || typeof kind !== 'string') {
    return undefined;
  }
  return {
    visual_state_id: id,
    kind,
    path: typeof o.path === 'string' ? o.path : null,
    expression: typeof o.expression === 'string' ? o.expression : null,
    motion: typeof o.motion === 'string' ? o.motion : null,
    fallback_image: typeof o.fallback_image === 'string' ? o.fallback_image : null,
    live2d_model: typeof o.live2d_model === 'string' ? o.live2d_model : null,
    rig3d_model: typeof o.rig3d_model === 'string' ? o.rig3d_model : null,
    context: typeof o.context === 'string' ? o.context : null,
  };
}
