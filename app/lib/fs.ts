import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function copyInto(source: string, dir: string): Promise<string> {
  await ensureDir(dir);
  const target = path.join(dir, path.basename(source));
  await fs.copyFile(source, target);
  return target;
}

export async function filesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesRecursive(full);
    if (entry.isFile()) return [full];
    return [];
  }));
  return nested.flat();
}

export function safeFilename(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
}
