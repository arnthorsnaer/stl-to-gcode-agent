#!/usr/bin/env bun
import { importModel } from '../lib/import-model.ts';
import { printStls } from '../lib/print.ts';

const source = process.argv[2];
if (!source) {
  console.error('usage: bun run import <thingiverse-url|stl-url|zip-url|local.stl|local.zip>');
  process.exit(1);
}

try {
  const { id, stls } = await importModel(source);
  printStls(id, stls);
  const printable = stls.filter((s) => s.printable);
  if (printable.length === 1) console.log(`next: bun run slice ${id}`);
  if (printable.length > 1) console.log(`next: bun run slice ${id} --stl <index>`);
  if (printable.length === 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
