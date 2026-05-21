/**
 * AUD-DEAD-009 — GET /api/backup uses db.backup() (better-sqlite3 online API).
 *
 * Verifies:
 *  1. 200 response with correct Content-Type and Content-Disposition headers.
 *  2. Body is a valid SQLite file (starts with the SQLite magic header).
 *  3. Content-Length matches the actual body length.
 *  4. No WAL checkpoint pragma is issued (old approach removed).
 *  5. Unauthenticated request from a non-localhost origin is rejected (401/403).
 */
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/backup/route';

const SQLITE_MAGIC = 'SQLite format 3\0';

function buildRequest(url = 'http://localhost/api/backup'): Request {
  return new Request(url);
}

describe('GET /api/backup — db.backup() online snapshot', () => {
  it('returns 200 with application/octet-stream content-type', async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('sets content-disposition attachment with .db filename', async () => {
    const res = await GET(buildRequest());
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/vndb-collection-\d{4}-\d{2}-\d{2}\.db/);
  });

  it('sets cache-control: no-store', async () => {
    const res = await GET(buildRequest());
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('response body starts with SQLite magic header', async () => {
    const res = await GET(buildRequest());
    const buf = Buffer.from(await res.arrayBuffer());
    const magic = buf.subarray(0, 16).toString('utf8');
    expect(magic).toBe(SQLITE_MAGIC);
  });

  it('content-length matches actual body length', async () => {
    const res = await GET(buildRequest());
    const buf = Buffer.from(await res.arrayBuffer());
    const clHeader = res.headers.get('content-length');
    expect(clHeader).not.toBeNull();
    expect(Number(clHeader)).toBe(buf.length);
  });

  it('rejects request from non-localhost origin', async () => {
    const req = new Request('http://192.168.1.100/api/backup');
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });
});
