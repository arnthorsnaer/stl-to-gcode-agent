import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'bun';
import { copyInto, ensureDir, safeFilename } from './fs.ts';
import { sanitizeId, sourceId, thingiverseId, thingiverseZipUrl } from './ids.ts';
import { projectPaths } from './paths.ts';
import { discoverStls, type StlInfo } from './stl.ts';

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function filenameFromUrl(url: string, response: Response): string {
  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (match?.[1]) return safeFilename(decodeURIComponent(match[1]));
  const base = safeFilename(path.basename(new URL(url).pathname));
  return base.includes('.') ? base : `${base || 'download'}.zip`;
}

async function download(url: string, dir: string): Promise<string> {
  await ensureDir(dir);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  const file = path.join(dir, filenameFromUrl(url, response));
  await Bun.write(file, await response.blob());
  return file;
}

async function isZip(file: string): Promise<boolean> {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(2);
    await handle.read(buffer, 0, 2, 0);
    return buffer.toString() === 'PK';
  } finally {
    await handle.close();
  }
}

async function assertZip(file: string): Promise<void> {
  if (!(await isZip(file))) {
    throw new Error(`not a ZIP archive: ${file}. If this is Thingiverse, it returned HTML instead of a model archive.`);
  }
}

async function unzipSafe(zip: string, dest: string): Promise<void> {
  await assertZip(zip);
  await ensureDir(dest);
  const list = await $`unzip -Z1 ${zip}`.text();
  for (const entry of list.split('\n').filter(Boolean)) {
    const normalized = path.normalize(entry);
    if (path.isAbsolute(entry) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
      throw new Error(`unsafe ZIP entry rejected: ${entry}`);
    }
  }
  await $`unzip -q -o ${zip} -d ${dest}`;
}

async function runAgentBrowser(args: string[], options: { timeoutMs?: number } = {}): Promise<string> {
  const proc = Bun.spawn(['agent-browser', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const timeout = options.timeoutMs
    ? setTimeout(() => proc.kill(), options.timeoutMs)
    : undefined;
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (timeout) clearTimeout(timeout);
  if (code !== 0) throw new Error(`agent-browser failed: agent-browser ${args.join(' ')}\n${stderr || stdout}`.trim());
  return stdout;
}

const THINGIVERSE_BROWSER_ARGS = '--disable-blink-features=AutomationControlled';
const THINGIVERSE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function refFor(snapshot: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = snapshot.match(new RegExp(`button "${escaped}".*?ref=(e\\d+)`));
  return match ? `@${match[1]}` : undefined;
}

function thingiverseTitleFromSnapshot(snapshot: string): string | undefined {
  for (const match of snapshot.matchAll(/heading "([^"]+)" \[level=1/g)) {
    const title = match[1].trim();
    if (title && !/^www\.thingiverse\.com$/i.test(title)) return title;
  }
  return undefined;
}

async function thingiverseProjectId(source: string): Promise<string> {
  const thing = thingiverseId(source);
  if (!thing) return sourceId(source);

  const session = `thingiverse-title-${thing}-${Date.now()}`;
  try {
    await runAgentBrowser(['--session', session, 'close']).catch(() => '');
    await runAgentBrowser([
      '--session', session,
      '--args', THINGIVERSE_BROWSER_ARGS,
      '--user-agent', THINGIVERSE_USER_AGENT,
      'open', `https://www.thingiverse.com/thing:${thing}`,
    ], { timeoutMs: 45_000 });
    await runAgentBrowser(['--session', session, 'wait', '--load', 'networkidle'], { timeoutMs: 45_000 });
    const snapshot = await runAgentBrowser(['--session', session, 'snapshot', '-i', '-u'], { timeoutMs: 30_000 });
    const title = thingiverseTitleFromSnapshot(snapshot);
    return title ? `${sanitizeId(title)}-thing-${thing}` : `thing-${thing}`;
  } finally {
    await runAgentBrowser(['--session', session, 'close']).catch(() => '');
  }
}

async function downloadThingiverseWithBrowser(source: string, todoDir: string): Promise<string> {
  const thing = thingiverseId(source);
  if (!thing) throw new Error(`not a Thingiverse thing URL: ${source}`);

  const session = `thingiverse-${thing}-${Date.now()}`;
  const url = `https://www.thingiverse.com/thing:${thing}`;

  await ensureDir(todoDir);
  try {
    await runAgentBrowser(['--session', session, 'close']).catch(() => '');
    await runAgentBrowser([
      '--session', session,
      '--download-path', todoDir,
      '--args', THINGIVERSE_BROWSER_ARGS,
      '--user-agent', THINGIVERSE_USER_AGENT,
      'open', url,
    ], { timeoutMs: 45_000 });
    await runAgentBrowser(['--session', session, 'wait', '--load', 'networkidle'], { timeoutMs: 45_000 });

    let snapshot = await runAgentBrowser(['--session', session, 'snapshot', '-i', '-u'], { timeoutMs: 30_000 });
    const deny = refFor(snapshot, 'Deny');
    if (deny) {
      await runAgentBrowser(['--session', session, 'click', deny], { timeoutMs: 15_000 });
      await runAgentBrowser(['--session', session, 'wait', '1000'], { timeoutMs: 5_000 });
      snapshot = await runAgentBrowser(['--session', session, 'snapshot', '-i', '-u'], { timeoutMs: 30_000 });
    }

    const downloadMatch = snapshot.match(/button "Download ([^"]+\.stl)".*?ref=(e\d+)/i);
    if (!downloadMatch) {
      throw new Error('Thingiverse browser fallback could not find a visible STL download button');
    }

    const filename = safeFilename(downloadMatch[1]);
    const output = path.join(todoDir, filename);
    await runAgentBrowser(['--session', session, 'download', `@${downloadMatch[2]}`, output], { timeoutMs: 90_000 });
    return output;
  } finally {
    await runAgentBrowser(['--session', session, 'close']).catch(() => '');
  }
}

export async function importModel(source: string): Promise<{ id: string; stls: StlInfo[] }> {
  const id = thingiverseId(source) ? await thingiverseProjectId(source) : sourceId(source);
  const paths = projectPaths(id);
  await ensureDir(paths.todo);
  await ensureDir(paths.inProcess);
  await ensureDir(paths.extracted);

  const thing = thingiverseId(source);
  let sourceFile: string;

  if (thing) {
    const zipUrl = thingiverseZipUrl(source)!;
    sourceFile = await download(zipUrl, paths.todo);
    if (/\.zip$/i.test(sourceFile) && await isZip(sourceFile)) {
      await unzipSafe(sourceFile, paths.extracted);
    } else {
      await fs.unlink(sourceFile).catch(() => {});
      sourceFile = await downloadThingiverseWithBrowser(source, paths.todo);
      await copyInto(sourceFile, paths.extracted);
    }
  } else {
    sourceFile = isUrl(source)
      ? await download(source, paths.todo)
      : await copyInto(path.resolve(source), paths.todo);

    if (/\.zip$/i.test(sourceFile)) {
      await unzipSafe(sourceFile, paths.extracted);
    } else if (/\.stl$/i.test(sourceFile)) {
      await copyInto(sourceFile, paths.extracted);
    } else {
      throw new Error(`expected .stl or .zip, got: ${sourceFile}`);
    }
  }

  const stls = await discoverStls(paths.extracted);
  await Bun.write(paths.stlsJson, `${JSON.stringify({ id, source, stls }, null, 2)}\n`);
  return { id, stls };
}
