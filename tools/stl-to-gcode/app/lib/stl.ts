import fs from 'node:fs/promises';
import path from 'node:path';
import { filesRecursive } from './fs.ts';

export const BUILD_VOLUME = { x: 220, y: 220, z: 250 } as const;

export type Bounds = {
  min: [number, number, number];
  max: [number, number, number];
  size: { x: number; y: number; z: number };
};

export type StlInfo = {
  index: number;
  path: string;
  relativePath: string;
  bytes: number;
  triangles: number;
  bounds: Bounds;
  printable: boolean;
  reason?: string;
};

function bounds(min: number[], max: number[]): Bounds {
  return {
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
    size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] },
  };
}

function add(min: number[], max: number[], x: number, y: number, z: number): void {
  min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
  max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
}

function parseBinary(buffer: Buffer): { triangles: number; bounds: Bounds } {
  if (buffer.length < 84) throw new Error('binary STL too small');
  const triangles = buffer.readUInt32LE(80);
  if (84 + triangles * 50 > buffer.length) throw new Error('binary STL truncated');
  if (triangles === 0) throw new Error('STL has no triangles');

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangles; i++) {
    const base = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const off = base + v * 12;
      add(min, max, buffer.readFloatLE(off), buffer.readFloatLE(off + 4), buffer.readFloatLE(off + 8));
    }
  }
  return { triangles, bounds: bounds(min, max) };
}

function parseAscii(text: string): { triangles: number; bounds: Bounds } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  const re = /^\s*vertex\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*$/gim;
  for (const m of text.matchAll(re)) {
    const x = Number(m[1]), y = Number(m[2]), z = Number(m[3]);
    if (![x, y, z].every(Number.isFinite)) throw new Error('invalid STL vertex');
    add(min, max, x, y, z);
    vertices++;
  }
  if (vertices < 3) throw new Error('ASCII STL has no triangles');
  return { triangles: Math.floor(vertices / 3), bounds: bounds(min, max) };
}

export async function parseStl(file: string): Promise<{ triangles: number; bounds: Bounds }> {
  const buffer = await fs.readFile(file);
  const count = buffer.length >= 84 ? buffer.readUInt32LE(80) : 0;
  if (buffer.length >= 84 && 84 + count * 50 === buffer.length) return parseBinary(buffer);
  const prefix = buffer.subarray(0, 256).toString('utf8').trimStart();
  if (prefix.startsWith('solid')) return parseAscii(buffer.toString('utf8'));
  return parseBinary(buffer);
}

export function fits(b: Bounds): boolean {
  return b.size.x <= BUILD_VOLUME.x && b.size.y <= BUILD_VOLUME.y && b.size.z <= BUILD_VOLUME.z;
}

export async function discoverStls(extractedDir: string): Promise<StlInfo[]> {
  const files = (await filesRecursive(extractedDir)).filter((f) => /\.stl$/i.test(f)).sort();
  const out: StlInfo[] = [];
  for (const file of files) {
    const stat = await fs.stat(file);
    const index = out.length + 1;
    const relativePath = path.relative(extractedDir, file);
    try {
      const parsed = await parseStl(file);
      const printable = fits(parsed.bounds);
      out.push({
        index,
        path: file,
        relativePath,
        bytes: stat.size,
        triangles: parsed.triangles,
        bounds: parsed.bounds,
        printable,
        reason: printable ? undefined : `exceeds ${BUILD_VOLUME.x}x${BUILD_VOLUME.y}x${BUILD_VOLUME.z}mm build volume`,
      });
    } catch (error) {
      out.push({
        index,
        path: file,
        relativePath,
        bytes: stat.size,
        triangles: 0,
        bounds: { min: [0, 0, 0], max: [0, 0, 0], size: { x: 0, y: 0, z: 0 } },
        printable: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return out;
}

export function dims(b: Bounds): string {
  return `${b.size.x.toFixed(1)} x ${b.size.y.toFixed(1)} x ${b.size.z.toFixed(1)} mm`;
}
