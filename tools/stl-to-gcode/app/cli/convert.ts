#!/usr/bin/env bun
import { importModel } from '../lib/import-model.ts';
import { printStls } from '../lib/print.ts';
import { sliceImported } from '../lib/slice-model.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const source = process.argv[2];
if (!source || source.startsWith('--')) {
  console.error('usage: bun run convert <source> [--stl <index>] [--profile pla-normal] [--prusa-slicer /path/to/prusa-slicer]');
  process.exit(1);
}

try {
  const { id, stls } = await importModel(source);
  printStls(id, stls);
  const output = await sliceImported(id, {
    stlIndex: flag('--stl') ? Number(flag('--stl')) : undefined,
    profile: flag('--profile') ?? 'pla-normal',
    prusaSlicer: flag('--prusa-slicer'),
  });
  console.log(`gcode: ${output.gcode}`);
  console.log(`preview: ${output.preview}`);
  console.log(`isometric preview: ${output.isometricPreview}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
