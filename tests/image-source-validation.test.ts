import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '@/lib/safe-fetch';
import {
  downloadToBucket,
  isValidImageSourceValue,
  UnsupportedFileType,
} from '@/lib/files';

const mockSafeFetch = vi.mocked(safeFetch);

beforeEach(() => {
  mockSafeFetch.mockReset();
});

describe('isValidImageSourceValue', () => {
  it('accepts storage-relative, application-relative, and allowlisted remote sources', () => {
    expect(isValidImageSourceValue('cover/custom.jpg')).toBe(true);
    expect(isValidImageSourceValue('/api/files/cover/custom.jpg')).toBe(true);
    expect(isValidImageSourceValue('https://cdn.vndb.org/cv/custom.jpg')).toBe(true);
  });

  it('rejects traversal, encoded traversal, scheme smuggling, and off-allowlist hosts', () => {
    expect(isValidImageSourceValue('../private.jpg')).toBe(false);
    expect(isValidImageSourceValue('%252e%252e/private.jpg')).toBe(false);
    expect(isValidImageSourceValue('//evil.example.com/private.jpg')).toBe(false);
    expect(isValidImageSourceValue('javascript:alert(1)')).toBe(false);
    expect(isValidImageSourceValue('https://evil.example.com/private.jpg')).toBe(false);
  });
});

describe('downloadToBucket raster sniffing', () => {
  it('rejects remote SVG payloads', async () => {
    mockSafeFetch.mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/custom.svg', 'vnImage', 'custom'),
    ).rejects.toBeInstanceOf(UnsupportedFileType);
  });

  it('stores a supported raster payload with its sniffed extension', async () => {
    mockSafeFetch.mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );
    await expect(
      downloadToBucket('https://cdn.vndb.org/cv/custom.bin', 'vnImage', 'custom'),
    ).resolves.toMatch(/\.png$/);
  });

  it('redacts remote paths and queries from download errors', async () => {
    mockSafeFetch.mockResolvedValue(new Response(null, { status: 403 }));
    try {
      await downloadToBucket('https://cdn.vndb.org/cv/private.jpg?token=secret', 'vnImage', 'private');
      expect.unreachable('download should fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('https://cdn.vndb.org');
      expect(message).not.toContain('/cv/private.jpg');
      expect(message).not.toContain('secret');
    }
  });
});
