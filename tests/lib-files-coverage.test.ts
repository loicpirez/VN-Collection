/**
 * Hermetic coverage for `src/lib/files.ts` storage helpers.
 *
 * `STORAGE_ROOT` is the per-worker temp dir pinned by `tests/setup.ts`, so
 * the real `mkdir` / `writeFile` / `readFile` calls land in throwaway
 * space. `safeFetch` (the network primitive) is mocked. Covers
 * `fileExists` (hit / miss / traversal reject), `readStored` (hit with
 * sniffed content-type / miss / traversal null), `saveUpload` (magic-byte
 * accept + reject + truthful extension), `publicUrlFor`, and the
 * `downloadToBucket` guard branches not covered elsewhere: off-allowlist
 * reject, declared-Content-Length cap, and streaming cap.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }));

import { safeFetch } from '@/lib/safe-fetch';
import {
  STORAGE_DIRS,
  STORAGE_ROOT,
  UnsupportedFileType,
  downloadToBucket,
  fileExists,
  publicUrlFor,
  readStored,
  saveUpload,
} from '@/lib/files';

const mSafeFetch = vi.mocked(safeFetch);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function fileFromBytes(bytes: Uint8Array, type: string, name = 'upload'): File {
  return new File([bytes as BlobPart], name, { type });
}

beforeEach(() => {
  mSafeFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('publicUrlFor', () => {
  it('prefixes a stored relative path and returns null for empty input', () => {
    expect(publicUrlFor('cover/v1.jpg')).toBe('/api/files/cover/v1.jpg');
    expect(publicUrlFor(null)).toBeNull();
    expect(publicUrlFor(undefined)).toBeNull();
    expect(publicUrlFor('')).toBeNull();
  });
});

describe('fileExists', () => {
  it('returns false for an empty path without touching the disk', async () => {
    expect(await fileExists('')).toBe(false);
  });

  it('returns true for a real file under the storage root and false for a missing one', async () => {
    const dir = `${STORAGE_ROOT}/${STORAGE_DIRS.vnImage}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/exists-fixture.bin`, Buffer.from('x'));
    expect(await fileExists(`${STORAGE_DIRS.vnImage}/exists-fixture.bin`)).toBe(true);
    expect(await fileExists(`${STORAGE_DIRS.vnImage}/missing-fixture.bin`)).toBe(false);
  });

  it('rejects a path that escapes the storage root', async () => {
    expect(await fileExists('../../etc/passwd')).toBe(false);
  });
});

describe('readStored', () => {
  it('returns the buffer plus a content-type sniffed from the extension', async () => {
    const dir = `${STORAGE_ROOT}/${STORAGE_DIRS.vnCover}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/read-fixture.png`, Buffer.from(PNG_BYTES));
    const out = await readStored(`${STORAGE_DIRS.vnCover}/read-fixture.png`);
    expect(out).not.toBeNull();
    expect(out!.contentType).toBe('image/png');
    expect(Buffer.from(out!.buffer).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('returns the octet-stream fallback content-type for an unknown extension', async () => {
    const dir = `${STORAGE_ROOT}/${STORAGE_DIRS.vnCover}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/read-fixture.dat`, Buffer.from('x'));
    const out = await readStored(`${STORAGE_DIRS.vnCover}/read-fixture.dat`);
    expect(out!.contentType).toBe('application/octet-stream');
  });

  it('returns null for a missing file and for a traversal path', async () => {
    expect(await readStored(`${STORAGE_DIRS.vnCover}/does-not-exist.png`)).toBeNull();
    expect(await readStored('../../etc/passwd')).toBeNull();
  });
});

describe('saveUpload', () => {
  it('stores a sniffed JPEG under a truthful .jpg extension even when name lies', async () => {
    const rel = await saveUpload('vnCover', fileFromBytes(JPEG_BYTES, 'image/png', 'evil.png'), 'cover-hint');
    expect(rel).toMatch(new RegExp(`^${STORAGE_DIRS.vnCover}/cover-hint-[0-9a-f]{8}\\.jpg$`));
    // The bytes really landed on disk and are readable back.
    const written = await readFile(`${STORAGE_ROOT}/${rel}`);
    expect(written.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('throws UnsupportedFileType for a payload that is not a known raster format', async () => {
    const html = new TextEncoder().encode('<html><body>not an image</body></html>');
    await expect(
      saveUpload('vnCover', fileFromBytes(html, 'image/png', 'fake.png'), 'cover-hint'),
    ).rejects.toBeInstanceOf(UnsupportedFileType);
  });
});

describe('downloadToBucket — guard branches', () => {
  it('rejects an off-allowlist host before issuing any fetch', async () => {
    await expect(
      downloadToBucket('https://evil.example.com/a.png', 'vnImage', 'hint'),
    ).rejects.toThrow(/allowlist/);
    expect(mSafeFetch).not.toHaveBeenCalled();
  });

  it('rejects when the declared Content-Length exceeds the image cap', async () => {
    mSafeFetch.mockResolvedValue(
      new Response('x', { status: 200, headers: { 'content-length': String(21 * 1024 * 1024) } }),
    );
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/big.png', 'vnImage', 'big'),
    ).rejects.toThrow(/too large/);
  });

  it('rejects when the streamed body exceeds the cap mid-read', async () => {
    // A ReadableStream that emits more than 20 MiB so the running counter
    // trips before the whole payload is buffered.
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    mSafeFetch.mockResolvedValue(new Response(stream, { status: 200 }));
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/stream.png', 'vnImage', 'stream'),
    ).rejects.toThrow(/streaming cap/);
  });

  it('throws a redacted error when the upstream returns a non-OK status', async () => {
    mSafeFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/missing.png?token=secret', 'vnImage', 'missing'),
    ).rejects.toThrow(/cdn\.vndb\.org/);
  });

  it('falls back to arrayBuffer() and rejects a bodyless response that is not a raster image', async () => {
    // A 200 response carrying no stream body exercises the `!res.body`
    // fallback in readBodyWithCap; the empty buffer then fails magic-byte
    // sniffing and surfaces UnsupportedFileType.
    mSafeFetch.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/empty.png', 'vnImage', 'empty'),
    ).rejects.toBeInstanceOf(UnsupportedFileType);
  });

  it('stores a small raster delivered as a one-shot arrayBuffer (no stream body)', async () => {
    // Build a Response whose `.body` getter is null so the arrayBuffer
    // fallback path returns the bytes directly.
    const res = new Response(Buffer.from(PNG_BYTES), { status: 200 });
    Object.defineProperty(res, 'body', { get: () => null });
    mSafeFetch.mockResolvedValue(res);
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/oneshot.png', 'vnImage', 'oneshot'),
    ).resolves.toMatch(/\.png$/);
  });
});
