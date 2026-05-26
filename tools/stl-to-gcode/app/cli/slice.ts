#!/usr/bin/env bun
import { sliceImported } from '../lib/slice-model.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const id = process.argv[2];
if (!id || id.startsWith('--')) {
  console.error('usage: bun run slice <id> [--stl <index>] [--profile pla-normal] [--prusa-slicer /path/to/prusa-slicer]');
  process.exit(1);
}

try {
  const output = await sliceImported(id, {
    stlIndex: flag('--stl') ? Number(flag('--stl')) : undefined,
    profile: flag('--profile') ?? 'pla-normal',
    prusaSlicer: flag('--prusa-slicer'),
  });
  console.log(output.gcode);
  console.log(output.preview);
  console.log(output.isometricPreview);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
