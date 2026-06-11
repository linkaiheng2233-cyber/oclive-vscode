import * as fs from 'fs';
import * as path from 'path';

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

export async function appendUtf8(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath);
  await fs.promises.appendFile(filePath, content, 'utf8');
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath);
  await fs.promises.writeFile(filePath, content, 'utf8');
}

export async function readUtf8IfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
