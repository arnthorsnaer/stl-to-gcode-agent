import fs from 'node:fs';
import path from 'node:path';

export const toolRoot = path.resolve(import.meta.dir, '..', '..');
export const workflowRoot = path.resolve(toolRoot, '..', '..');
const settings = JSON.parse(fs.readFileSync(path.join(workflowRoot, 'settings.json'), 'utf8')) as { slicer?: { profileRoot?: string } };
if (!settings.slicer?.profileRoot) throw new Error('missing settings.json:slicer.profileRoot');
export const root = workflowRoot;
export const projectsRoot = path.join(workflowRoot, 'projects');
export const profilesRoot = path.join(workflowRoot, settings.slicer.profileRoot);

export function projectPaths(id: string) {
  const dir = path.join(projectsRoot, id);
  const todo = path.join(dir, 'todo');
  const inProcess = path.join(dir, 'in-process');
  const done = path.join(dir, 'done');
  return {
    dir,
    todo,
    inProcess,
    done,
    extracted: path.join(inProcess, 'extracted'),
    stlsJson: path.join(inProcess, 'stls.json'),
  };
}
