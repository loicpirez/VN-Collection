import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/files', () => ({
  readStored: vi.fn(),
}));

import { GET } from '@/app/api/files/[...path]/route';
import { readStored } from '@/lib/files';

const mockReadStored = readStored as ReturnType<typeof vi.fn>;

function makeCtx(pathSegments: string[]) {
  return { params: Promise.resolve({ path: pathSegments }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/files/[...path] — path traversal guard', () => {
  it('rejects remote asset reads before touching storage', async () => {
    const res = await GET(new Request('http://example.test/api/files/cover/v1.jpg'), makeCtx(['cover', 'v1.jpg']));
    expect(res.status).toBe(403);
    expect(mockReadStored).not.toHaveBeenCalled();
  });

  it('allows a remote asset read with the configured admin token', async () => {
    const previous = process.env.VN_ADMIN_TOKEN;
    process.env.VN_ADMIN_TOKEN = 'files-route-test-token';
    mockReadStored.mockResolvedValue({
      buffer: Buffer.from('img').buffer,
      contentType: 'image/png',
    });
    try {
      const res = await GET(new Request('http://example.test/api/files/cover/v1.png', {
        headers: { authorization: 'Bearer files-route-test-token' },
      }), makeCtx(['cover', 'v1.png']));
      expect(res.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.VN_ADMIN_TOKEN;
      else process.env.VN_ADMIN_TOKEN = previous;
    }
  });

  it('rejects path containing .. with 400', async () => {
    const res = await GET(new Request('http://localhost/api/files/../../etc/passwd'), makeCtx(['..', '..', 'etc', 'passwd']));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid path/i);
    expect(mockReadStored).not.toHaveBeenCalled();
  });

  it('rejects path with .. embedded in segment with 400', async () => {
    const res = await GET(new Request('http://localhost/api/files/a/../b'), makeCtx(['a', '..', 'b']));
    expect(res.status).toBe(400);
    expect(mockReadStored).not.toHaveBeenCalled();
  });

  it('returns 404 when readStored returns null', async () => {
    mockReadStored.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/files/cover/v1.jpg'), makeCtx(['cover', 'v1.jpg']));
    expect(res.status).toBe(404);
  });

  it('returns 200 with correct content-type for a valid image', async () => {
    mockReadStored.mockResolvedValue({
      buffer: Buffer.from('fake-image-data').buffer,
      contentType: 'image/jpeg',
    });
    const res = await GET(new Request('http://localhost/api/files/cover/v1.jpg'), makeCtx(['cover', 'v1.jpg']));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/^private,/);
  });

  it('serves SVG as application/octet-stream with attachment disposition', async () => {
    mockReadStored.mockResolvedValue({
      buffer: Buffer.from('<svg/>').buffer,
      contentType: 'image/svg+xml',
    });
    const res = await GET(new Request('http://localhost/api/files/badge.svg'), makeCtx(['badge.svg']));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);
  });

  it('allows valid path with no .. characters', async () => {
    mockReadStored.mockResolvedValue({
      buffer: Buffer.from('img').buffer,
      contentType: 'image/png',
    });
    const res = await GET(new Request('http://localhost/api/files/covers/v123.png'), makeCtx(['covers', 'v123.png']));
    expect(res.status).toBe(200);
    expect(mockReadStored).toHaveBeenCalledWith('covers/v123.png');
  });
});
