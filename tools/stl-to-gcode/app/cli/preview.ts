#!/usr/bin/env bun
import path from 'node:path';
import { exists } from '../lib/fs.ts';
import { generateGcodePreview, generateGcodePreviews, generateIsometricGcodePreview } from '../lib/gcode-preview.ts';
import { projectPaths } from '../lib/paths.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const input = process.argv[2];
if (!input || input.startsWith('--')) {
  console.error('usage: bun run preview <id|file.gcode> [--profile pla-normal] [--isometric] [--output preview.svg]');
  process.exit(1);
}

try {
  const profile = flag('--profile') ?? 'pla-normal';
  const gcode = /\.gcode$/i.test(input)
    ? path.resolve(input)
    : path.join(projectPaths(input).done, `${input}-${profile}.gcode`);

  if (!(await exists(gcode))) throw new Error(`G-code not found: ${gcode}`);

  const output = flag('--output');
  if (output) {
    const preview = process.argv.includes('--isometric')
      ? await generateIsometricGcodePreview(gcode, output)
      : await generateGcodePreview(gcode, output);
    console.log(preview);
  } else if (process.argv.includes('--isometric')) {
    console.log(await generateIsometricGcodePreview(gcode));
  } else {
    const previews = await generateGcodePreviews(gcode);
    console.log(previews.topDown);
    console.log(previews.isometric);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
