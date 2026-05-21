import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    restoreFromSqliteFile: vi.fn(),
  };
});

vi.mock('@/lib/activity', () => ({
  recordActivity: vi.fn(),
}));

import { POST } from '@/app/api/backup/restore/route';
import { restoreFromSqliteFile } from '@/lib/db';

const mockRestore = restoreFromSqliteFile as ReturnType<typeof vi.fn>;

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf-8');

function makeSqliteFile(size = 4096): Buffer {
  const buf = Buffer.alloc(size, 0);
  SQLITE_MAGIC.copy(buf);
  return buf;
}

function makeRequest(file: Blob | null, url = 'http://localhost/api/backup/restore'): Request {
  if (!file) {
    return new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: '--test\r\nContent-Disposition: form-data; name="other"\r\n\r\nvalue\r\n--test--\r\n',
    });
  }
  const fd = new FormData();
  fd.append('file', file, 'backup.db');
  return new Request(url, { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRestore.mockResolvedValue({ tables: 10, rows: 1000 });
});

describe('POST /api/backup/restore', () => {
  it('rejects request from non-localhost origin with 401/403', async () => {
    const buf = makeSqliteFile();
    const file = new Blob([buf]);
    const req = makeRequest(file, 'http://192.168.1.100/api/backup/restore');
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('rejects non-multipart content-type with 400', async () => {
    const req = new Request('http://localhost/api/backup/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: makeSqliteFile(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/multipart/i);
  });

  it('rejects non-SQLite file (wrong magic bytes) with 400', async () => {
    const notSqlite = Buffer.from('This is not a SQLite database at all!');
    const file = new Blob([notSqlite]);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/SQLite/i);
  });

  it('accepts valid SQLite file and returns 200', async () => {
    const file = new Blob([makeSqliteFile()]);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; summary: unknown };
    expect(body.ok).toBe(true);
    expect(mockRestore).toHaveBeenCalledOnce();
  });

  it('returns 500 when restoreFromSqliteFile throws', async () => {
    mockRestore.mockRejectedValue(new Error('disk full'));
    const file = new Blob([makeSqliteFile()]);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('disk full');
  });
});
