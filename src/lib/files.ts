import 'server-only';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { resolve, extname, basename, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';

export const STORAGE_ROOT = resolve(process.cwd(), 'data', 'storage');
export const STORAGE_DIRS = {
  vnImage: 'vn',
  vnScreenshot: 'vn-sc',
  vnCover: 'cover',
  producerLogo: 'producer',
  seriesCover: 'series',
} as const;

export type StorageBucket = keyof typeof STORAGE_DIRS;

await ensureDir(STORAGE_ROOT);

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

function bucketPath(bucket: StorageBucket): string {
  return resolve(STORAGE_ROOT, STORAGE_DIRS[bucket]);
}

function isInsideStorage(absPath: string): boolean {
  const norm = normalize(absPath);
  return norm.startsWith(STORAGE_ROOT + '/') || norm === STORAGE_ROOT;
}

export async function fileExists(relPath: string): Promise<boolean> {
  if (!relPath) return false;
  const abs = resolve(STORAGE_ROOT, relPath);
  if (!isInsideStorage(abs)) return false;
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

export async function readStored(relPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const abs = resolve(STORAGE_ROOT, relPath);
  if (!isInsideStorage(abs)) return null;
  try {
    const buffer = await readFile(abs);
    const ct = guessContentType(abs);
    return { buffer, contentType: ct };
  } catch {
    return null;
  }
}

function extFromContentType(ct: string | null): string {
  if (!ct) return '.bin';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('svg')) return '.svg';
  return '.bin';
}

function guessContentType(absPath: string): string {
  const e = extname(absPath).toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  if (e === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

const FETCH_TIMEOUT_MS = 15000;

export async function downloadToBucket(
  url: string,
  bucket: StorageBucket,
  filenameHint: string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`download ${url} -> ${res.status}`);
  const ct = res.headers.get('content-type');
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = ct ? extFromContentType(ct) : extname(url) || '.bin';
  const safeName = `${sanitizeFilename(filenameHint)}${ext}`;
  const dir = bucketPath(bucket);
  await ensureDir(dir);
  const abs = resolve(dir, safeName);
  await writeFile(abs, buf);
  return `${STORAGE_DIRS[bucket]}/${safeName}`;
}

export async function saveUpload(
  bucket: StorageBucket,
  file: File,
  filenameHint: string,
): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ct = file.type || guessContentType(file.name);
  const ext = extFromContentType(ct);
  const id = randomBytes(4).toString('hex');
  const safeName = `${sanitizeFilename(filenameHint)}-${id}${ext}`;
  const dir = bucketPath(bucket);
  await ensureDir(dir);
  const abs = resolve(dir, safeName);
  await writeFile(abs, buf);
  return `${STORAGE_DIRS[bucket]}/${safeName}`;
}

function sanitizeFilename(s: string): string {
  return basename(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
}

export function publicUrlFor(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  return `/api/files/${relPath}`;
}
