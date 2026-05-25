import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/egs-cover/[id]/route';
import { db } from '@/lib/db';

function cacheTarget(egsId: number, target: string): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(`egs:cover-resolved:${egsId}`, JSON.stringify({ url: target }), now, now + 60_000);
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:cover-resolved:%'`).run();
});

describe('GET /api/egs-cover/[id]', () => {
  it('rejects cached same-origin redirects outside /api/files', async () => {
    cacheTarget(123, 'http://localhost/admin/internal.png');
    const res = await GET(new Request('http://localhost/api/egs-cover/123'), {
      params: Promise.resolve({ id: '123' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows cached same-origin file redirects only under /api/files', async () => {
    cacheTarget(124, 'http://localhost/api/files/covers/sample.jpg');
    const res = await GET(new Request('http://localhost/api/egs-cover/124'), {
      params: Promise.resolve({ id: '124' }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/api/files/covers/sample.jpg');
  });

  it('rejects relative redirects outside /api/files', async () => {
    cacheTarget(125, '/debug/internal.png');
    const res = await GET(new Request('http://localhost/api/egs-cover/125'), {
      params: Promise.resolve({ id: '125' }),
    });
    expect(res.status).toBe(403);
  });
});
