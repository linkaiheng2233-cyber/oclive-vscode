import type { AttachReason, KernelActionPlan } from './kernelStrategy';

/** Status bar primary label (aligned with desktop `kernelProfileUx`). */
export function kernelConnectionLabel(info: {
  degraded?: boolean;
  profileHintKey?: string | null;
  replacedExisting?: boolean;
}): string {
  const hint = info.profileHintKey?.trim();
  if (hint === 'profile_mismatch_no_replace') {
    return '已连接（配置有差异，可能需要重启内核）';
  }
  if (hint === 'kernel_pinned_profile_mismatch') {
    return '已连接（内核已锁定，配置可能有差异）';
  }
  if (hint === 'replaced_for_profile' || info.replacedExisting) {
    return '已连接（已切换至更匹配的内核）';
  }
  if (hint === 'degraded' || hint === 'legacy_fallback' || info.degraded) {
    return '已连接（使用降级内核，部分能力不可用）';
  }
  return '已连接至本地内核';
}

export function profileHintFromPlan(plan: KernelActionPlan): string | undefined {
  switch (plan.attach_reason) {
    case 'kernel_pinned_profile_mismatch':
      return '内核 binary 已 pin，且 profile 与 VS Code 发行版不完全一致';
    case 'profile_mismatch_no_replace':
      return '运行内核 profile 与 VS Code 不一致（未允许 replace）';
    case 'profile_compatible':
      return '运行内核 profile 已满足 VS Code 发行版需求';
    case 'legacy_fallback':
      return '使用降级 attach，profile 可能不完全匹配';
    default:
      if (plan.replace_reason === 'profile_mismatch') {
        return '已切换至更匹配 VS Code 发行版的内核';
      }
      if (plan.degraded) {
        return '使用降级内核，部分能力可能不可用';
      }
      return undefined;
  }
}

export function profileHintKeyFromPlan(plan: KernelActionPlan): string | undefined {
  if (plan.attach_reason) {
    return plan.attach_reason;
  }
  if (plan.replace_reason === 'profile_mismatch') {
    return 'replaced_for_profile';
  }
  if (plan.degraded) {
    return 'degraded';
  }
  return undefined;
}

export function attachReasonToHintKey(reason: AttachReason | null | undefined): string | undefined {
  return reason ?? undefined;
}
