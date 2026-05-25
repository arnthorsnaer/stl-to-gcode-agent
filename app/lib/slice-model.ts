import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, exists } from './fs.ts';
import { generateGcodePreviews } from './gcode-preview.ts';
import { profilesRoot, projectPaths } from './paths.ts';
import type { StlInfo } from './stl.ts';

export type StlsFile = { id: string; source: string; stls: StlInfo[] };

export async function loadStls(id: string): Promise<StlsFile> {
  const file = projectPaths(id).stlsJson;
  if (!(await exists(file))) throw new Error(`no imported model found for id '${id}'. Run: bun run import <source>`);
  return JSON.parse(await fs.readFile(file, 'utf8')) as StlsFile;
}

export function chooseStl(stls: StlInfo[], requested?: number): StlInfo {
  if (requested !== undefined) {
    const stl = stls.find((item) => item.index === requested);
    if (!stl) throw new Error(`STL index ${requested} not found`);
    if (!stl.printable) throw new Error(`STL index ${requested} is not printable: ${stl.reason ?? 'unknown reason'}`);
    return stl;
  }

  const printable = stls.filter((item) => item.printable);
  if (printable.length === 0) throw new Error('no printable STL found');
  if (printable.length > 1) throw new Error(`multiple printable STLs found; pass --stl <index>`);
  return printable[0];
}

export async function sliceImported(id: string, options: { stlIndex?: number; profile?: string; prusaSlicer?: string } = {}): Promise<{ gcode: string; preview: string; isometricPreview: string }> {
  const profile = options.profile ?? 'pla-normal';
  const profilePath = path.join(profilesRoot, `${profile}.ini`);
  if (!(await exists(profilePath))) throw new Error(`profile not found: ${profilePath}`);

  const imported = await loadStls(id);
  const stl = chooseStl(imported.stls, options.stlIndex);
  const paths = projectPaths(id);
  await ensureDir(paths.done);

  const out = path.join(paths.done, `${id}-${profile}.gcode`);
  const bin = options.prusaSlicer ?? process.env.PRUSA_SLICER_BIN ?? 'prusa-slicer';
  const proc = Bun.spawn([
    bin,
    '--load', profilePath,
    '--export-gcode',
    '--output', out,
    stl.path,
  ], { stdout: 'pipe', stderr: 'pipe' });

  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (code !== 0) {
    throw new Error(`PrusaSlicer failed with exit code ${code}\n${stdout}\n${stderr}`.trim());
  }

  const previews = await generateGcodePreviews(out);
  return { gcode: out, preview: previews.topDown, isometricPreview: previews.isometric };
}
