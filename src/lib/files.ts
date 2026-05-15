import 'server-only';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { extname, basename, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';

// String-concat instead of `path.resolve(process.cwd(), …)` so
// Turbopack's NFT (Node File Tracing) static analyzer doesn't drag
// the entire `data/` tree into the build trace — `resolve()` /
// `join()` calls under cwd are flagged "overly broad" and the
// tracer can't see through plain concatenation. Same trick used for
// `DB_PATH` in `lib/db.ts`.
//
// Constant is materialised at module-load time (one process.cwd
// snapshot per Node process). Tests rotate cwd via a fresh
// `mkdtemp` per worker so this is fine — but a runtime `chdir`
// elsewhere would NOT update the value. Don't call `chdir`.
export const STORAGE_ROOT = `${process.cwd()}/data/storage`;
export const STORAGE_DIRS = {
  vnImage: 'vn',
  vnScreenshot: 'vn-sc',
  vnCover: 'cover',
  producerLogo: 'producer',
  seriesCover: 'series',
  character: 'character',
} as const;

export type StorageBucket = keyof typeof STORAGE_DIRS;

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

function bucketPath(bucket: StorageBucket): string {
  return `${STORAGE_ROOT}/${STORAGE_DIRS[bucket]}`;
}

function isInsideStorage(absPath: string): boolean {
  const norm = normalize(absPath);
  return norm.startsWith(STORAGE_ROOT + '/') || norm === STORAGE_ROOT;
}

export async function fileExists(relPath: string): Promise<boolean> {
  if (!relPath) return false;
  const abs = normalize(`${STORAGE_ROOT}/${relPath}`);
  if (!isInsideStorage(abs)) return false;
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

export async function readStored(relPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const abs = normalize(`${STORAGE_ROOT}/${relPath}`);
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
  // SSRF guard — the URL is normally VNDB / EGS / Steam, but it can
  // come from VNDB extlinks or an EGS shop id that an attacker can
  // influence via /api/collection/import. Block everything not on
  // the shared allowlist before we touch the network.
  if (!isAllowedHttpTarget(url)) {
    throw new Error(`download blocked by host allowlist: ${url}`);
  }
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
  const abs = `${dir}/${safeName}`;
  await writeFile(abs, buf);
  return `${STORAGE_DIRS[bucket]}/${safeName}`;
}

/**
 * Lightweight magic-byte sniff so a client lying about file.type
 * ("Content-Type: image/png" on an actual HTML / SVG file) can't
 * slip a non-image past the upload routes. Each entry is the
 * canonical MIME type plus the leading bytes that uniquely
 * identify the format.
 */
const IMAGE_MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: "RIFF....WEBP" — the four bytes at offset 8 are "WEBP".
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { mime: 'image/bmp', bytes: [0x42, 0x4d] },
  // AVIF: ISO-BMFF "ftypavif" at offset 4.
  { mime: 'image/avif', bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], offset: 4 },
];

function detectImageMime(buf: Buffer): string | null {
  for (const sig of IMAGE_MAGIC_BYTES) {
    const offset = sig.offset ?? 0;
    if (buf.length < offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return null;
}

export class UnsupportedFileType extends Error {
  constructor(public providedType: string | null) {
    super(`unsupported file type${providedType ? ` (declared as ${providedType})` : ''}`);
  }
}

/**
 * Save a client-uploaded image. Sniffs the actual bytes to determine
 * the real MIME type — the client-supplied Content-Type can lie,
 * and previously a banner / cover upload would happily persist an
 * HTML or SVG file with a fake `.png` extension. By picking the
 * extension from sniffed bytes instead of `file.type`, we both
 * reject non-image uploads up front and store the file under a
 * truthful extension.
 */
export async function saveUpload(
  bucket: StorageBucket,
  file: File,
  filenameHint: string,
): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const detected = detectImageMime(buf);
  if (!detected) {
    throw new UnsupportedFileType(file.type || null);
  }
  const ext = extFromContentType(detected);
  const id = randomBytes(4).toString('hex');
  const safeName = `${sanitizeFilename(filenameHint)}-${id}${ext}`;
  const dir = bucketPath(bucket);
  await ensureDir(dir);
  const abs = `${dir}/${safeName}`;
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
