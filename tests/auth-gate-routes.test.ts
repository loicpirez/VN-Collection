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
 * NEW-TCO-002 — NEW-SECA-001..019: all newly-gated write routes return 403 from external.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import {
  POST as collectionPOST,
  PATCH as collectionPATCH,
  DELETE as collectionDELETE,
} from '@/app/api/collection/[id]/route';
import {
  POST as bannerPOST,
  PATCH as bannerPATCH,
  DELETE as bannerDELETE,
} from '@/app/api/collection/[id]/banner/route';
import {
  POST as coverPOST,
  DELETE as coverDELETE,
  PATCH as coverPATCH,
} from '@/app/api/collection/[id]/cover/route';
import { POST as linkVndbPOST } from '@/app/api/vn/[id]/link-vndb/route';
import {
  POST as gameLogPOST,
  PATCH as gameLogPATCH,
  DELETE as gameLogDELETE,
} from '@/app/api/collection/[id]/game-log/route';
import {
  POST as ownedReleasesPOST,
  PATCH as ownedReleasesPATCH,
  DELETE as ownedReleasesDELETE,
} from '@/app/api/collection/[id]/owned-releases/route';
import { GET as steamSyncGET, POST as steamSyncPOST } from '@/app/api/steam/sync/route';
import { POST as steamLinkPOST, DELETE as steamLinkDELETE } from '@/app/api/steam/link/route';
import {
  PATCH as vndbStatusPATCH,
  DELETE as vndbStatusDELETE,
} from '@/app/api/vn/[id]/vndb-status/route';
import {
  POST as collectionRoutesPOST,
  PATCH as collectionRoutesPATCH,
} from '@/app/api/collection/[id]/routes/route';
import { PATCH as sourcePrefPATCH } from '@/app/api/collection/[id]/source-pref/route';
import {
  POST as erogamescapePOST,
  DELETE as erogamescapeDELETE,
} from '@/app/api/vn/[id]/erogamescape/route';
import {
  POST as wishlistIdPOST,
  DELETE as wishlistIdDELETE,
} from '@/app/api/wishlist/[id]/route';
import { POST as seriesPOST } from '@/app/api/series/route';
import {
  PATCH as seriesIdPATCH,
  DELETE as seriesIdDELETE,
} from '@/app/api/series/[id]/route';
import {
  POST as seriesVnPOST,
  DELETE as seriesVnDELETE,
} from '@/app/api/series/[id]/vn/[vnId]/route';
import { POST as listsPOST } from '@/app/api/lists/route';
import {
  PATCH as listsIdPATCH,
  DELETE as listsIdDELETE,
} from '@/app/api/lists/[id]/route';
import { GET as collectionActivityGET } from '@/app/api/collection/[id]/activity/route';
import {
  POST as producerLogoPOST,
  DELETE as producerLogoDELETE,
} from '@/app/api/producer/[id]/logo/route';
import {
  POST as egsVndbPOST,
  DELETE as egsVndbDELETE,
} from '@/app/api/egs/[id]/vndb/route';
import {
  PATCH as routeIdPATCH,
  DELETE as routeIdDELETE,
} from '@/app/api/route/[routeId]/route';
import {
  POST as customDescPOST,
  PATCH as customDescPATCH,
  DELETE as customDescDELETE,
} from '@/app/api/collection/[id]/custom-description/route';
import { POST as staffDownloadPOST } from '@/app/api/staff/[id]/download/route';
import { POST as producerRefreshPOST } from '@/app/api/producer/[id]/refresh/route';
import { GET as textualGET } from '@/app/api/search/textual/route';
import { GET as findGET } from '@/app/api/collection/find/route';
import {
  POST as shelvesPOST,
  PATCH as shelvesPATCH,
} from '@/app/api/shelves/route';
import {
  PATCH as shelvesIdPATCH,
  DELETE as shelvesIdDELETE,
} from '@/app/api/shelves/[id]/route';
import {
  POST as shelvesSlotsPOST,
  DELETE as shelvesSlotsDELETE,
} from '@/app/api/shelves/[id]/slots/route';
import {
  POST as shelvesDisplaysPOST,
  DELETE as shelvesDisplaysDELETE,
} from '@/app/api/shelves/[id]/displays/route';
import {
  POST as readingQueuePOST,
  DELETE as readingQueueDELETE,
  PATCH as readingQueuePATCH,
} from '@/app/api/reading-queue/route';
import {
  POST as savedFiltersPOST,
  DELETE as savedFiltersDELETE,
  PATCH as savedFiltersPATCH,
} from '@/app/api/saved-filters/route';
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

describe('AUD-SEC-010 — q length cap on search (loopback behavioral)', () => {
  it('/api/search/textual: 301-char query returns same hits as 300-char query (truncation proof)', async () => {
    const q300 = 'a'.repeat(300);
    const q301 = 'a'.repeat(301);
    const res300 = await textualGET(new NextRequest(`http://127.0.0.1/api/search/textual?q=${q300}`));
    const res301 = await textualGET(new NextRequest(`http://127.0.0.1/api/search/textual?q=${q301}`));
    expect(res300.status).toBe(200);
    expect(res301.status).toBe(200);
    const body300 = await res300.json() as { hits: unknown[] };
    const body301 = await res301.json() as { hits: unknown[] };
    expect(body301.hits.length).toBe(body300.hits.length);
  });

  it('/api/collection/find: 301-char query returns same hits as 300-char query (truncation proof)', async () => {
    const q300 = 'a'.repeat(300);
    const q301 = 'a'.repeat(301);
    const res300 = await findGET(new NextRequest(`http://127.0.0.1/api/collection/find?q=${q300}`));
    const res301 = await findGET(new NextRequest(`http://127.0.0.1/api/collection/find?q=${q301}`));
    expect(res300.status).toBe(200);
    expect(res301.status).toBe(200);
    const body300 = await res300.json() as { matches: unknown[] };
    const body301 = await res301.json() as { matches: unknown[] };
    expect(body301.matches.length).toBe(body300.matches.length);
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

describe('NEW-TCO-002 — NEW-SECA-001..019: newly-gated routes return 403 from external', () => {
  const ctx = (id = 'v1') => ({ params: Promise.resolve({ id }) });
  const routeCtx = (routeId = '1') => ({ params: Promise.resolve({ routeId }) });
  const seriesVnCtx = () => ({ params: Promise.resolve({ id: '1', vnId: 'v1' }) });

  it('POST /api/collection/[id]', async () => {
    expect((await collectionPOST(externalReq('/api/collection/v1', 'POST'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]', async () => {
    expect((await collectionPATCH(externalReq('/api/collection/v1', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]', async () => {
    expect((await collectionDELETE(externalReq('/api/collection/v1', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/collection/[id]/banner', async () => {
    expect((await bannerPOST(externalReq('/api/collection/v1/banner', 'POST'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]/banner', async () => {
    expect((await bannerPATCH(externalReq('/api/collection/v1/banner', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]/banner', async () => {
    expect((await bannerDELETE(externalReq('/api/collection/v1/banner', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/collection/[id]/cover', async () => {
    expect((await coverPOST(externalReq('/api/collection/v1/cover', 'POST'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]/cover', async () => {
    expect((await coverDELETE(externalReq('/api/collection/v1/cover', 'DELETE'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]/cover', async () => {
    expect((await coverPATCH(externalReq('/api/collection/v1/cover', 'PATCH'), ctx())).status).toBe(403);
  });

  it('POST /api/vn/[id]/link-vndb', async () => {
    expect((await linkVndbPOST(externalReq('/api/vn/egs_1/link-vndb', 'POST'), ctx('egs_1'))).status).toBe(403);
  });

  it('POST /api/collection/[id]/game-log', async () => {
    expect((await gameLogPOST(externalReq('/api/collection/v1/game-log', 'POST'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]/game-log', async () => {
    expect((await gameLogPATCH(externalReq('/api/collection/v1/game-log', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]/game-log', async () => {
    expect((await gameLogDELETE(externalReq('/api/collection/v1/game-log', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/collection/[id]/owned-releases', async () => {
    expect((await ownedReleasesPOST(externalReq('/api/collection/v1/owned-releases', 'POST'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]/owned-releases', async () => {
    expect((await ownedReleasesPATCH(externalReq('/api/collection/v1/owned-releases', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]/owned-releases', async () => {
    expect((await ownedReleasesDELETE(externalReq('/api/collection/v1/owned-releases', 'DELETE'), ctx())).status).toBe(403);
  });

  it('GET /api/steam/sync', async () => {
    expect((await steamSyncGET(externalReq('/api/steam/sync'))).status).toBe(403);
  });
  it('POST /api/steam/sync', async () => {
    expect((await steamSyncPOST(externalReq('/api/steam/sync', 'POST'))).status).toBe(403);
  });

  it('POST /api/steam/link', async () => {
    expect((await steamLinkPOST(externalReq('/api/steam/link', 'POST'))).status).toBe(403);
  });
  it('DELETE /api/steam/link', async () => {
    expect((await steamLinkDELETE(externalReq('/api/steam/link', 'DELETE'))).status).toBe(403);
  });

  it('PATCH /api/vn/[id]/vndb-status', async () => {
    expect((await vndbStatusPATCH(externalReq('/api/vn/v1/vndb-status', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/vn/[id]/vndb-status', async () => {
    expect((await vndbStatusDELETE(externalReq('/api/vn/v1/vndb-status', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/wishlist/[id]', async () => {
    expect((await wishlistIdPOST(externalReq('/api/wishlist/v1', 'POST'), ctx())).status).toBe(403);
  });
  it('DELETE /api/wishlist/[id]', async () => {
    expect((await wishlistIdDELETE(externalReq('/api/wishlist/v1', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/series', async () => {
    expect((await seriesPOST(externalReq('/api/series', 'POST'))).status).toBe(403);
  });
  it('PATCH /api/series/[id]', async () => {
    expect((await seriesIdPATCH(externalReq('/api/series/1', 'PATCH'), ctx('1'))).status).toBe(403);
  });
  it('DELETE /api/series/[id]', async () => {
    expect((await seriesIdDELETE(externalReq('/api/series/1', 'DELETE'), ctx('1'))).status).toBe(403);
  });
  it('POST /api/series/[id]/vn/[vnId]', async () => {
    expect((await seriesVnPOST(externalReq('/api/series/1/vn/v1', 'POST'), seriesVnCtx())).status).toBe(403);
  });
  it('DELETE /api/series/[id]/vn/[vnId]', async () => {
    expect((await seriesVnDELETE(externalReq('/api/series/1/vn/v1', 'DELETE'), seriesVnCtx())).status).toBe(403);
  });

  it('POST /api/lists', async () => {
    expect((await listsPOST(externalReq('/api/lists', 'POST'))).status).toBe(403);
  });
  it('PATCH /api/lists/[id]', async () => {
    expect((await listsIdPATCH(externalReq('/api/lists/1', 'PATCH'), ctx('1'))).status).toBe(403);
  });
  it('DELETE /api/lists/[id]', async () => {
    expect((await listsIdDELETE(externalReq('/api/lists/1', 'DELETE'), ctx('1'))).status).toBe(403);
  });

  it('GET /api/collection/[id]/activity', async () => {
    expect((await collectionActivityGET(externalReq('/api/collection/v1/activity'), ctx())).status).toBe(403);
  });

  it('POST /api/producer/[id]/logo', async () => {
    expect((await producerLogoPOST(externalReq('/api/producer/p1/logo', 'POST'), ctx('p1'))).status).toBe(403);
  });
  it('DELETE /api/producer/[id]/logo', async () => {
    expect((await producerLogoDELETE(externalReq('/api/producer/p1/logo', 'DELETE'), ctx('p1'))).status).toBe(403);
  });

  it('POST /api/egs/[id]/vndb', async () => {
    expect((await egsVndbPOST(externalReq('/api/egs/1/vndb', 'POST'), ctx('1'))).status).toBe(403);
  });
  it('DELETE /api/egs/[id]/vndb', async () => {
    expect((await egsVndbDELETE(externalReq('/api/egs/1/vndb', 'DELETE'), ctx('1'))).status).toBe(403);
  });

  it('PATCH /api/route/[routeId]', async () => {
    expect((await routeIdPATCH(externalReq('/api/route/1', 'PATCH'), routeCtx())).status).toBe(403);
  });
  it('DELETE /api/route/[routeId]', async () => {
    expect((await routeIdDELETE(externalReq('/api/route/1', 'DELETE'), routeCtx())).status).toBe(403);
  });

  it('POST /api/collection/[id]/custom-description', async () => {
    expect((await customDescPOST(externalReq('/api/collection/v1/custom-description', 'POST'), ctx())).status).toBe(403);
  });
  it('PATCH /api/collection/[id]/custom-description', async () => {
    expect((await customDescPATCH(externalReq('/api/collection/v1/custom-description', 'PATCH'), ctx())).status).toBe(403);
  });
  it('DELETE /api/collection/[id]/custom-description', async () => {
    expect((await customDescDELETE(externalReq('/api/collection/v1/custom-description', 'DELETE'), ctx())).status).toBe(403);
  });

  it('POST /api/staff/[id]/download', async () => {
    expect((await staffDownloadPOST(externalReq('/api/staff/s1/download', 'POST'), ctx('s1'))).status).toBe(403);
  });

  it('POST /api/producer/[id]/refresh', async () => {
    expect((await producerRefreshPOST(externalReq('/api/producer/p1/refresh', 'POST'), ctx('p1'))).status).toBe(403);
  });

  it('POST /api/collection/[id]/routes', async () => {
    const res = await collectionRoutesPOST(externalReq('/api/collection/v1/routes', 'POST', { name: 'r' }), ctx());
    expect(res.status).toBe(403);
  });
  it('PATCH /api/collection/[id]/routes', async () => {
    const res = await collectionRoutesPATCH(externalReq('/api/collection/v1/routes', 'PATCH', { ids: [1] }), ctx());
    expect(res.status).toBe(403);
  });
  it('PATCH /api/collection/[id]/source-pref', async () => {
    const res = await sourcePrefPATCH(externalReq('/api/collection/v1/source-pref', 'PATCH', { title: 'vndb' }), ctx());
    expect(res.status).toBe(403);
  });
  it('POST /api/vn/[id]/erogamescape', async () => {
    const res = await erogamescapePOST(externalReq('/api/vn/v1/erogamescape', 'POST', { egs_id: 1 }), ctx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/vn/[id]/erogamescape', async () => {
    const res = await erogamescapeDELETE(externalReq('/api/vn/v1/erogamescape', 'DELETE'), ctx());
    expect(res.status).toBe(403);
  });
});

describe('auth gate — shelves (T-2)', () => {
  const ctx = (id = '1') => ({ params: Promise.resolve({ id }) });

  it('POST /api/shelves', async () => {
    expect((await shelvesPOST(externalReq('/api/shelves', 'POST', { name: 'test' }))).status).toBe(403);
  });
  it('PATCH /api/shelves', async () => {
    expect((await shelvesPATCH(externalReq('/api/shelves', 'PATCH', { order: [1] }))).status).toBe(403);
  });
  it('PATCH /api/shelves/[id]', async () => {
    expect((await shelvesIdPATCH(externalReq('/api/shelves/1', 'PATCH', { name: 'x' }), ctx())).status).toBe(403);
  });
  it('DELETE /api/shelves/[id]', async () => {
    expect((await shelvesIdDELETE(externalReq('/api/shelves/1', 'DELETE'), ctx())).status).toBe(403);
  });
  it('POST /api/shelves/[id]/slots', async () => {
    expect((await shelvesSlotsPOST(externalReq('/api/shelves/1/slots', 'POST', { row: 0, col: 0, vn_id: 'v1', release_id: 'r1' }), ctx())).status).toBe(403);
  });
  it('DELETE /api/shelves/[id]/slots', async () => {
    expect((await shelvesSlotsDELETE(externalReq('/api/shelves/1/slots', 'DELETE', { vn_id: 'v1', release_id: 'r1' }), ctx())).status).toBe(403);
  });
  it('POST /api/shelves/[id]/displays', async () => {
    expect((await shelvesDisplaysPOST(externalReq('/api/shelves/1/displays', 'POST', { after_row: 0, position: 0, vn_id: 'v1', release_id: 'r1' }), ctx())).status).toBe(403);
  });
  it('DELETE /api/shelves/[id]/displays', async () => {
    expect((await shelvesDisplaysDELETE(externalReq('/api/shelves/1/displays', 'DELETE', { vn_id: 'v1', release_id: 'r1' }), ctx())).status).toBe(403);
  });
});

describe('auth gate — reading-goal/queue (T-3)', () => {
  it('POST /api/reading-queue', async () => {
    expect((await readingQueuePOST(externalReq('/api/reading-queue', 'POST', { vn_id: 'v1' }))).status).toBe(403);
  });
  it('DELETE /api/reading-queue', async () => {
    expect((await readingQueueDELETE(externalReq('/api/reading-queue?vn_id=v1', 'DELETE'))).status).toBe(403);
  });
  it('PATCH /api/reading-queue', async () => {
    expect((await readingQueuePATCH(externalReq('/api/reading-queue', 'PATCH', { ids: ['v1'] }))).status).toBe(403);
  });
  it('POST /api/saved-filters', async () => {
    expect((await savedFiltersPOST(externalReq('/api/saved-filters', 'POST', { name: 'f', params: '{}' }))).status).toBe(403);
  });
  it('DELETE /api/saved-filters', async () => {
    expect((await savedFiltersDELETE(externalReq('/api/saved-filters?id=1', 'DELETE'))).status).toBe(403);
  });
  it('PATCH /api/saved-filters', async () => {
    expect((await savedFiltersPATCH(externalReq('/api/saved-filters', 'PATCH', { ids: [1] }))).status).toBe(403);
  });
});

describe('auth gate — happy-path: valid Bearer token from external origin (NEW-TCO-007)', () => {
  const TEST_TOKEN = 'auth-gate-happy-path-token-tco007';
  const savedToken = process.env.VN_ADMIN_TOKEN;

  beforeAll(() => { process.env.VN_ADMIN_TOKEN = TEST_TOKEN; });
  afterAll(() => {
    if (savedToken !== undefined) process.env.VN_ADMIN_TOKEN = savedToken;
    else delete process.env.VN_ADMIN_TOKEN;
  });

  it('GET /api/wishlist with correct Bearer from external IP returns 200', async () => {
    const req = new NextRequest('http://93.184.216.34/api/wishlist', {
      method: 'GET',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const res = await wishlistGET(req);
    expect(res.status).toBe(200);
  });
});
