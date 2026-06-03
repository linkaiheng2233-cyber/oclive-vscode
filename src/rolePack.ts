import * as fs from 'fs';
import * as path from 'path';
import { emotionImageCandidates } from './emotionAssets';

export function readRoleDisplayName(rolePackDir: string): string {
  const bp = path.join(rolePackDir, 'pipeline.ocblueprint');
  const manifest = path.join(rolePackDir, 'manifest.json');
  try {
    if (fs.existsSync(bp)) {
      const j = JSON.parse(fs.readFileSync(bp, 'utf8')) as { meta?: { name?: string; id?: string } };
      const name = j.meta?.name?.trim();
      if (name) {
        return name;
      }
      const id = j.meta?.id?.trim();
      if (id) {
        return id;
      }
    }
    if (fs.existsSync(manifest)) {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string; id?: string };
      if (j.name?.trim()) {
        return j.name.trim();
      }
      if (j.id?.trim()) {
        return j.id.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return path.basename(rolePackDir);
}

export function readSceneWelcome(rolePackDir: string, sceneId: string): string | undefined {
  const p = path.join(rolePackDir, 'scenes', sceneId, 'scene.json');
  if (!fs.existsSync(p)) {
    return undefined;
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { welcome_message?: string };
    const w = j.welcome_message?.trim();
    return w || undefined;
  } catch {
    return undefined;
  }
}

/** Role pack folders under roles root that contain v2 blueprint or legacy manifest. */
export function listRoleIds(rolesDir: string): string[] {
  if (!fs.existsSync(rolesDir)) {
    return [];
  }
  const out: string[] = [];
  for (const name of fs.readdirSync(rolesDir)) {
    const dir = path.join(rolesDir, name);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }
    if (
      fs.existsSync(path.join(dir, 'pipeline.ocblueprint')) ||
      fs.existsSync(path.join(dir, 'manifest.json'))
    ) {
      out.push(name);
    }
  }
  return out.sort();
}

/** First existing file under `assets/images/`, or undefined. */
export function resolveEmotionImagePath(rolePackDir: string, emotion: string): string | undefined {
  const dir = path.join(rolePackDir, 'assets', 'images');
  if (!fs.existsSync(dir)) {
    return undefined;
  }
  for (const file of emotionImageCandidates(emotion)) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return undefined;
}
