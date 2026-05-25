import path from 'node:path';

export const root = path.resolve(import.meta.dir, '..', '..');
export const projectsRoot = path.join(root, 'projects');
export const profilesRoot = path.join(root, 'profiles', 'ender3-v2-neo');

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
