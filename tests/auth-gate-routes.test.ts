/**
 * AUD-SEC-002..009, AUD-SEC-012 — auth gate on all newly-gated routes.
 *
 * Every route listed here must return 403 when called from a non-loopback
 * origin without an admin token. The gate fires before any DB / network
 * work, so tests need no mocking — the 403 path is pure HTTP metadata.
 *
 * AUD-SEC-001 — vn_ids cap (>200 returns 429) on full-download route.
 * AUD-SEC-006 — year clamping on reading-goal route.
 * AUD-SEC-010 — q length cap on search/textual and collection/find routes.
 * AUD-SEC-013 — settings activity log redacts sensitive keys.
 * TCO-010 — maintenance routes return valid JSON shape from loopback with 0 items.
 */
import { describe, expect, it } from 'vitest';
import { GET as wishlistGET } from '@/app/api/wishlist/route';
import { GET as activityGET } from '@/app/api/activity/route';
import { GET as downloadStatusGET } from '@/app/api/download-status/route';
import { GET as streamGET } from '@/app/api/download-status/stream/route';
import { GET as placesGET } from '@/app/api/places/route';
import { GET as duplicatesGET } from '@/app/api/maintenance/duplicates/route';
import { GET as staleGET } from '@/app/api/maintenance/stale/route';
import { GET as egsSyncGET, POST as egsSyncPOST } from '@/app/api/egs/sync/route';
import { GET as vndbAuthGET } from '@/app/api/vndb/auth/route';
import { GET as readingGoalGET, POST as readingGoalPOST } from '@/app/api/reading-goal/route';
import { POST as fullDownloadPOST } from '@/app/api/collection/full-download/route';
import { NextRequest } from 'next/server';

function externalReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function loopbackReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('auth gate — newly-gated routes return 403 from external origin', () => {
  it('GET /api/wishlist', async () => {
    const res = await wishlistGET(externalReq('/api/wishlist'));
    expect(res.status).toBe(403);
  });

  it('GET /api/activity', async () => {
    const res = await activityGET(externalReq('/api/activity'));
    expect(res.status).toBe(403);
  });

  it('GET /api/download-status', async () => {
    const res = await downloadStatusGET(externalReq('/api/download-status'));
    expect(res.status).toBe(403);
  });

  it('GET /api/download-status/stream', async () => {
    const res = await streamGET(externalReq('/api/download-status/stream'));
    expect(res.status).toBe(403);
  });

  it('GET /api/places', async () => {
    const res = await placesGET(externalReq('/api/places'));
    expect(res.status).toBe(403);
  });

  it('GET /api/maintenance/duplicates', async () => {
    const res = await duplicatesGET(externalReq('/api/maintenance/duplicates'));
    expect(res.status).toBe(403);
  });

  it('GET /api/maintenance/stale', async () => {
    const res = await staleGET(externalReq('/api/maintenance/stale'));
    expect(res.status).toBe(403);
  });

  it('GET /api/egs/sync', async () => {
    const res = await egsSyncGET(externalReq('/api/egs/sync'));
    expect(res.status).toBe(403);
  });

  it('POST /api/egs/sync', async () => {
    const res = await egsSyncPOST(externalReq('/api/egs/sync', 'POST', { vn_ids: ['v1'] }));
    expect(res.status).toBe(403);
  });

  it('GET /api/vndb/auth', async () => {
    const res = await vndbAuthGET(externalReq('/api/vndb/auth'));
    expect(res.status).toBe(403);
  });

  it('GET /api/reading-goal', async () => {
    const res = await readingGoalGET(externalReq('/api/reading-goal'));
    expect(res.status).toBe(403);
  });

  it('POST /api/reading-goal', async () => {
    const res = await readingGoalPOST(externalReq('/api/reading-goal', 'POST', { year: 2024, target: 10 }));
    expect(res.status).toBe(403);
  });

  it('POST /api/collection/full-download', async () => {
    const res = await fullDownloadPOST(externalReq('/api/collection/full-download', 'POST', { vn_ids: ['v1'] }));
    expect(res.status).toBe(403);
  });
});

describe('AUD-SEC-001 — vn_ids cap on full-download (loopback)', () => {
  it('array >200 returns 429', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `v${i + 1}`);
    const res = await fullDownloadPOST(loopbackReq('/api/collection/full-download', 'POST', { vn_ids: ids }));
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('200');
  });

  it('array of exactly 200 is accepted (non-empty valid ids queued)', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `v${i + 1}`);
    const res = await fullDownloadPOST(loopbackReq('/api/collection/full-download', 'POST', { vn_ids: ids }));
    expect(res.status).toBe(202);
  });
});

describe('AUD-SEC-006 — reading-goal year clamping (loopback)', () => {
  it('year outside range defaults to current year', async () => {
    const res = await readingGoalGET(loopbackReq('/api/reading-goal?year=999999'));
    expect(res.status).toBe(200);
    const body = await res.json() as { year: number };
    expect(body.year).toBeLessThanOrEqual(2200);
    expect(body.year).toBeGreaterThanOrEqual(1900);
  });

  it('year -1 defaults to current year', async () => {
    const res = await readingGoalGET(loopbackReq('/api/reading-goal?year=-1'));
    expect(res.status).toBe(200);
    const body = await res.json() as { year: number };
    const currentYear = new Date().getFullYear();
    expect(body.year).toBe(currentYear);
  });
});

describe('AUD-SEC-010 — q length cap on search (loopback)', () => {
  it('/api/search/textual truncates q at 300 chars (source-pin)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'src/app/api/search/textual/route.ts'), 'utf8');
    expect(src).toMatch(/slice\(0,\s*Q_MAX\)/);
    expect(src).toMatch(/Q_MAX\s*=\s*300/);
  });

  it('/api/collection/find truncates q at 300 chars (source-pin)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'src/app/api/collection/find/route.ts'), 'utf8');
    expect(src).toMatch(/slice\(0,\s*Q_MAX\)/);
    expect(src).toMatch(/Q_MAX\s*=\s*300/);
  });
});

describe('TCO-011 — whitespace-only VN_ADMIN_TOKEN is treated as unset', () => {
  it('whitespace-only token env + whitespace Bearer header is denied (403)', async () => {
    const original = process.env.VN_ADMIN_TOKEN;
    process.env.VN_ADMIN_TOKEN = '   ';
    const req = new NextRequest('http://93.184.216.34/api/wishlist', {
      headers: { Authorization: 'Bearer    ' },
    });
    const res = await wishlistGET(req);
    process.env.VN_ADMIN_TOKEN = original;
    expect(res.status).toBe(403);
  });

  it('whitespace-only token env + correct-looking Bearer is denied (403)', async () => {
    const original = process.env.VN_ADMIN_TOKEN;
    process.env.VN_ADMIN_TOKEN = '   ';
    const req = new NextRequest('http://93.184.216.34/api/wishlist', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await wishlistGET(req);
    process.env.VN_ADMIN_TOKEN = original;
    expect(res.status).toBe(403);
  });

  it('real token env + whitespace Bearer header is denied (403)', async () => {
    const original = process.env.VN_ADMIN_TOKEN;
    process.env.VN_ADMIN_TOKEN = 'real-secret';
    const req = new NextRequest('http://93.184.216.34/api/wishlist', {
      headers: { Authorization: 'Bearer    ' },
    });
    const res = await wishlistGET(req);
    process.env.VN_ADMIN_TOKEN = original;
    expect(res.status).toBe(403);
  });
});

describe('AUD-SEC-013 — settings activity log redacts sensitive keys (source-pin)', () => {
  it('maskPayloadValues function exists and covers sensitive keys', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'src/app/api/settings/route.ts'), 'utf8');
    expect(src).toMatch(/SENSITIVE_LOG_KEYS/);
    expect(src).toMatch(/vndb_token/);
    expect(src).toMatch(/steam_api_key/);
    expect(src).toMatch(/vndb_backup_url/);
    expect(src).toMatch(/REDACTED/);
    expect(src).toMatch(/maskPayloadValues/);
    expect(src).toMatch(/maskPayloadValues\(body/);
  });
});

describe('TCO-010 — maintenance routes return valid JSON from loopback with 0 items', () => {
  it('GET /api/maintenance/duplicates — 200 with groups array when table is empty', async () => {
    const res = await duplicatesGET(loopbackReq('/api/maintenance/duplicates'));
    expect(res.status).toBe(200);
    const body = await res.json() as { groups: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups).toHaveLength(0);
  });

  it('GET /api/maintenance/stale — 200 with rows array when table is empty', async () => {
    const res = await staleGET(loopbackReq('/api/maintenance/stale'));
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(0);
  });
});
