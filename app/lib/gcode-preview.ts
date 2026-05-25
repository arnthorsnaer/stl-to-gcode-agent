import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from './fs.ts';
import { BUILD_VOLUME } from './stl.ts';

type State = {
  x: number;
  y: number;
  z: number;
  e: number;
  absoluteXyz: boolean;
  absoluteE: boolean;
};

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  z: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type ParsedGcode = {
  segments: Segment[];
  bounds: Bounds;
  layers: number;
};

type Point2 = { x: number; y: number };

function stripComment(line: string): string {
  return line.replace(/;.*/, '').trim();
}

function words(line: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const match of line.matchAll(/([A-Za-z])\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi)) {
    out.set(match[1].toUpperCase(), Number(match[2]));
  }
  return out;
}

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
}

function addBounds(bounds: Bounds, s: Segment): void {
  bounds.minX = Math.min(bounds.minX, s.x1, s.x2);
  bounds.minY = Math.min(bounds.minY, s.y1, s.y2);
  bounds.maxX = Math.max(bounds.maxX, s.x1, s.x2);
  bounds.maxY = Math.max(bounds.maxY, s.y1, s.y2);
  bounds.minZ = Math.min(bounds.minZ, s.z);
  bounds.maxZ = Math.max(bounds.maxZ, s.z);
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
}

function colorForT(t: number): string {
  const hue = 220 - t * 180; // blue low layers -> green/yellow high layers
  return `hsl(${hue.toFixed(0)} 85% 45%)`;
}

function bucketForZ(z: number, minZ: number, maxZ: number): number {
  if (maxZ <= minZ) return 0;
  return Math.max(0, Math.min(63, Math.round(((z - minZ) / (maxZ - minZ)) * 63)));
}

function parseGcode(text: string, gcodePath: string): ParsedGcode {
  const state: State = { x: 0, y: 0, z: 0, e: 0, absoluteXyz: true, absoluteE: true };
  const segments: Segment[] = [];
  const bounds = emptyBounds();

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;

    if (/^G90\b/i.test(line)) {
      state.absoluteXyz = true;
      continue;
    }
    if (/^G91\b/i.test(line)) {
      state.absoluteXyz = false;
      continue;
    }
    if (/^M82\b/i.test(line)) {
      state.absoluteE = true;
      continue;
    }
    if (/^M83\b/i.test(line)) {
      state.absoluteE = false;
      continue;
    }

    const command = line.match(/^([GMT])\s*(\d+)/i);
    if (!command) continue;
    const code = `${command[1].toUpperCase()}${command[2]}`;
    const w = words(line);

    if (code === 'G92') {
      if (w.has('X')) state.x = w.get('X')!;
      if (w.has('Y')) state.y = w.get('Y')!;
      if (w.has('Z')) state.z = w.get('Z')!;
      if (w.has('E')) state.e = w.get('E')!;
      continue;
    }

    if (code !== 'G0' && code !== 'G1') continue;

    const previous = { ...state };
    if (w.has('X')) state.x = state.absoluteXyz ? w.get('X')! : state.x + w.get('X')!;
    if (w.has('Y')) state.y = state.absoluteXyz ? w.get('Y')! : state.y + w.get('Y')!;
    if (w.has('Z')) state.z = state.absoluteXyz ? w.get('Z')! : state.z + w.get('Z')!;

    let eDelta = 0;
    if (w.has('E')) {
      const e = w.get('E')!;
      eDelta = state.absoluteE ? e - state.e : e;
      state.e = state.absoluteE ? e : state.e + e;
    }

    const xyMoved = previous.x !== state.x || previous.y !== state.y;
    if (code === 'G1' && eDelta > 0 && xyMoved) {
      const segment = { x1: previous.x, y1: previous.y, x2: state.x, y2: state.y, z: state.z };
      segments.push(segment);
      addBounds(bounds, segment);
    }
  }

  if (segments.length === 0) throw new Error(`no extrusion moves found in G-code: ${gcodePath}`);
  return { segments, bounds, layers: new Set(segments.map((s) => s.z.toFixed(3))).size };
}

async function parsedFromFile(gcodePath: string): Promise<ParsedGcode> {
  return parseGcode(await fs.readFile(gcodePath, 'utf8'), gcodePath);
}

export function previewPathFor(gcodePath: string): string {
  return gcodePath.replace(/\.gcode$/i, '-preview.svg');
}

export function isometricPreviewPathFor(gcodePath: string): string {
  return gcodePath.replace(/\.gcode$/i, '-preview-isometric.svg');
}

function extrusionPathsTopDown(parsed: ParsedGcode): string {
  const paths = new Map<number, string[]>();
  for (const s of parsed.segments) {
    const bucket = bucketForZ(s.z, parsed.bounds.minZ, parsed.bounds.maxZ);
    const commands = paths.get(bucket) ?? [];
    commands.push(`M${s.x1.toFixed(2)} ${s.y1.toFixed(2)}L${s.x2.toFixed(2)} ${s.y2.toFixed(2)}`);
    paths.set(bucket, commands);
  }

  return [...paths.entries()].sort(([a], [b]) => a - b).map(([bucket, commands]) => {
    const color = colorForT(bucket / 63);
    return `<path d="${commands.join('')}" stroke="${color}" />`;
  }).join('\n    ');
}

function iso(x: number, y: number, z: number): Point2 {
  const angle = Math.PI / 6;
  return {
    x: (x - y) * Math.cos(angle),
    y: (x + y) * Math.sin(angle) - z * 2.5,
  };
}

function pathBounds(points: Point2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return points.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function extrusionPathsIsometric(parsed: ParsedGcode): { paths: string; viewBox: string; bed: string } {
  const projected: Point2[] = [];
  const pathBuckets = new Map<number, string[]>();

  for (const s of parsed.segments) {
    const a = iso(s.x1, s.y1, s.z);
    const b = iso(s.x2, s.y2, s.z);
    projected.push(a, b);
    const bucket = bucketForZ(s.z, parsed.bounds.minZ, parsed.bounds.maxZ);
    const commands = pathBuckets.get(bucket) ?? [];
    commands.push(`M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    pathBuckets.set(bucket, commands);
  }

  const bedCorners = [
    iso(0, 0, 0),
    iso(BUILD_VOLUME.x, 0, 0),
    iso(BUILD_VOLUME.x, BUILD_VOLUME.y, 0),
    iso(0, BUILD_VOLUME.y, 0),
  ];
  projected.push(...bedCorners);
  const b = pathBounds(projected);
  const pad = 18;
  const viewBox = `${(b.minX - pad).toFixed(1)} ${(b.minY - pad).toFixed(1)} ${(b.maxX - b.minX + pad * 2).toFixed(1)} ${(b.maxY - b.minY + pad * 2).toFixed(1)}`;
  const bed = `<polygon points="${bedCorners.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="#f8f8f8" stroke="#111" stroke-width="0.6" />`;
  const paths = [...pathBuckets.entries()].sort(([a], [b2]) => a - b2).map(([bucket, commands]) => {
    const color = colorForT(bucket / 63);
    return `<path d="${commands.join('')}" stroke="${color}" />`;
  }).join('\n    ');

  return { paths, viewBox, bed };
}

export async function generateGcodePreview(gcodePath: string, outputPath = previewPathFor(gcodePath)): Promise<string> {
  const parsed = await parsedFromFile(gcodePath);
  const width = BUILD_VOLUME.x;
  const height = BUILD_VOLUME.y;
  const filename = path.basename(gcodePath);
  const modelWidth = parsed.bounds.maxX - parsed.bounds.minX;
  const modelHeight = parsed.bounds.maxY - parsed.bounds.minY;
  const extrusionPaths = extrusionPathsTopDown(parsed);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${width} ${height}" role="img" aria-label="Top-down G-code preview for ${esc(filename)}">
  <title>${esc(filename)} top-down preview</title>
  <desc>Top-down preview of extrusion moves. Bed is ${width} x ${height} mm. Model bounds are ${modelWidth.toFixed(1)} x ${modelHeight.toFixed(1)} mm across ${parsed.layers} layers.</desc>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#fafafa" stroke="#111" stroke-width="0.4" />
  <g stroke="#ddd" stroke-width="0.12">
    ${Array.from({ length: Math.floor(width / 10) + 1 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="${height}" />`).join('\n    ')}
    ${Array.from({ length: Math.floor(height / 10) + 1 }, (_, i) => `<line x1="0" y1="${i * 10}" x2="${width}" y2="${i * 10}" />`).join('\n    ')}
  </g>
  <g transform="translate(0 ${height}) scale(1 -1)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.35">
    ${extrusionPaths}
  </g>
  <g font-family="monospace" font-size="4" fill="#111">
    <rect x="2" y="2" width="116" height="22" fill="white" opacity="0.82" stroke="#ccc" stroke-width="0.2" />
    <text x="4" y="7">${esc(filename)}</text>
    <text x="4" y="12">top-down; segments: ${parsed.segments.length}, layers: ${parsed.layers}</text>
    <text x="4" y="17">bounds: ${modelWidth.toFixed(1)} x ${modelHeight.toFixed(1)} mm, z ${parsed.bounds.minZ.toFixed(2)}-${parsed.bounds.maxZ.toFixed(2)} mm</text>
    <text x="4" y="22">bed: ${width} x ${height} mm</text>
  </g>
</svg>
`;

  await ensureDir(path.dirname(outputPath));
  await Bun.write(outputPath, svg);
  return outputPath;
}

export async function generateIsometricGcodePreview(gcodePath: string, outputPath = isometricPreviewPathFor(gcodePath)): Promise<string> {
  const parsed = await parsedFromFile(gcodePath);
  const filename = path.basename(gcodePath);
  const modelWidth = parsed.bounds.maxX - parsed.bounds.minX;
  const modelHeight = parsed.bounds.maxY - parsed.bounds.minY;
  const isoPreview = extrusionPathsIsometric(parsed);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000" viewBox="${isoPreview.viewBox}" role="img" aria-label="Isometric G-code preview for ${esc(filename)}">
  <title>${esc(filename)} isometric preview</title>
  <desc>Isometric preview of extrusion moves. Model bounds are ${modelWidth.toFixed(1)} x ${modelHeight.toFixed(1)} mm, z ${parsed.bounds.minZ.toFixed(2)}-${parsed.bounds.maxZ.toFixed(2)} mm across ${parsed.layers} layers.</desc>
  <rect x="-10000" y="-10000" width="20000" height="20000" fill="#fff" />
  ${isoPreview.bed}
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.32" opacity="0.92">
    ${isoPreview.paths}
  </g>
  <g font-family="monospace" font-size="4" fill="#111">
    <rect x="${isoPreview.viewBox.split(' ')[0]}" y="${isoPreview.viewBox.split(' ')[1]}" width="132" height="22" fill="white" opacity="0.84" stroke="#ccc" stroke-width="0.2" />
    <text x="${Number(isoPreview.viewBox.split(' ')[0]) + 2}" y="${Number(isoPreview.viewBox.split(' ')[1]) + 5}">${esc(filename)}</text>
    <text x="${Number(isoPreview.viewBox.split(' ')[0]) + 2}" y="${Number(isoPreview.viewBox.split(' ')[1]) + 10}">isometric; segments: ${parsed.segments.length}, layers: ${parsed.layers}</text>
    <text x="${Number(isoPreview.viewBox.split(' ')[0]) + 2}" y="${Number(isoPreview.viewBox.split(' ')[1]) + 15}">bounds: ${modelWidth.toFixed(1)} x ${modelHeight.toFixed(1)} mm, z ${parsed.bounds.minZ.toFixed(2)}-${parsed.bounds.maxZ.toFixed(2)} mm</text>
    <text x="${Number(isoPreview.viewBox.split(' ')[0]) + 2}" y="${Number(isoPreview.viewBox.split(' ')[1]) + 20}">bed: ${BUILD_VOLUME.x} x ${BUILD_VOLUME.y} mm</text>
  </g>
</svg>
`;

  await ensureDir(path.dirname(outputPath));
  await Bun.write(outputPath, svg);
  return outputPath;
}

export async function generateGcodePreviews(gcodePath: string): Promise<{ topDown: string; isometric: string }> {
  const [topDown, isometric] = await Promise.all([
    generateGcodePreview(gcodePath),
    generateIsometricGcodePreview(gcodePath),
  ]);
  return { topDown, isometric };
}
