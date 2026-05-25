import path from 'node:path';
import crypto from 'node:crypto';

export function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'model';
}

export function sourceId(source: string): string {
  const thing = source.match(/thingiverse\.com\/thing:(\d+)/i);
  if (thing) return `thing-${thing[1]}`;

  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    const base = path.basename(url.pathname) || url.hostname;
    const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 8);
    return `${sanitizeId(base)}-${hash}`;
  }

  return sanitizeId(path.basename(source));
}

export function thingiverseId(source: string): string | undefined {
  return source.match(/thingiverse\.com\/thing:(\d+)/i)?.[1];
}

export function thingiverseZipUrl(source: string): string | undefined {
  const thing = thingiverseId(source);
  return thing ? `https://www.thingiverse.com/thing:${thing}/zip` : undefined;
}
