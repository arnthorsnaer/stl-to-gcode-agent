#!/usr/bin/env bun
import { printStls } from '../lib/print.ts';
import { loadStls } from '../lib/slice-model.ts';

const id = process.argv[2];
if (!id) {
  console.error('usage: bun run list <id>');
  process.exit(1);
}

try {
  const imported = await loadStls(id);
  printStls(imported.id, imported.stls);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
