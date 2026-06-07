import * as path from 'path';
import * as vscode from 'vscode';
import { getEffectiveConfig } from './runtimeConfig';
import { rolePackPath } from './config';
import {
  KernelClient,
  OCLIVE_DEFAULT_IDENTITY_SENTINEL,
} from './kernelClient';
import type { RoleInfo } from './types/roleInfo';

const SCENE_ID = 'vscode';

export async function applyUserIdentitySelection(
  kernel: KernelClient,
  identityId: string,
  roleId?: string,
): Promise<boolean> {
  const config = getEffectiveConfig();
  const rid = roleId ?? path.basename(rolePackPath(config));
  const roleInfo: RoleInfo | null = await kernel.fetchRoleInfo(rid, config);
  const binding = roleInfo?.identity_binding ?? 'per_scene';
  const updated =
    binding === 'global'
      ? await kernel.setUserIdentity(rid, identityId, config)
      : await kernel.setSceneUserIdentity(rid, SCENE_ID, identityId, config);
  return updated != null;
}

export async function pickAndApplyUserIdentity(
  kernel: KernelClient,
): Promise<boolean> {
  const config = getEffectiveConfig();
  const pack = rolePackPath(config);
  const roleId = path.basename(pack);
  const state = await kernel.getUserIdentityState(roleId, SCENE_ID, config);
  if (!state?.identities?.length) {
    void vscode.window.showInformationMessage('当前角色包未配置 user_identities/ 目录');
    return false;
  }
  const defaultLabel =
    state.identities.find((i) => i.id === state.default_identity_id)?.display_name ??
    state.default_identity_id;
  const items = [
    {
      label: `跟随包默认（${defaultLabel}）`,
      id: OCLIVE_DEFAULT_IDENTITY_SENTINEL,
    },
    ...state.identities.map((i) => ({
      label: i.display_name || i.id,
      id: i.id,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '选择用户身份',
  });
  if (!picked) {
    return false;
  }
  const ok = await applyUserIdentitySelection(kernel, picked.id, roleId);
  if (ok) {
    void vscode.window.showInformationMessage(`用户身份已切换：${picked.label}`);
  }
  return ok;
}

export { SCENE_ID };
