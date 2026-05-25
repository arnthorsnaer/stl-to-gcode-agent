import { dims, type StlInfo } from './stl.ts';

export function printStls(id: string, stls: StlInfo[]): void {
  console.log(`id: ${id}`);
  if (stls.length === 0) {
    console.log('no STL files found');
    return;
  }

  for (const stl of stls) {
    const status = stl.printable ? 'printable' : `not printable: ${stl.reason ?? 'unknown reason'}`;
    console.log(`[${stl.index}] ${stl.relativePath}`);
    console.log(`    ${status}; ${stl.triangles} triangles; ${dims(stl.bounds)}`);
  }
}
