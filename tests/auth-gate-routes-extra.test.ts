/**
 * Auth-gate 403 coverage for mutating handlers not already covered in
 * `auth-gate-routes.test.ts`. The gate fires before any DB or network
 * work, so each test asserts a pure 403 from a non-loopback origin
 * with no token — no mocking required.
 *
 * Scope: every POST / PATCH / PUT / DELETE handler under `src/app/api`
 * that calls `requireLocalhostOrToken` but had no 403 test yet.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// alicesoft-kobe family
import { POST as kobeLinkPOST, DELETE as kobeLinkDELETE } from '@/app/api/alicesoft-kobe/[code]/link/route';
import { POST as kobeDownloadVndbPOST } from '@/app/api/alicesoft-kobe/download-vndb/route';
import { POST as kobeFetchPOST } from '@/app/api/alicesoft-kobe/fetch/route';
import { POST as kobeMatchNextPOST } from '@/app/api/alicesoft-kobe/match-next/route';
import { POST as kobeMatchFromEgsPOST } from '@/app/api/alicesoft-kobe/match-vndb-from-egs/route';
import { POST as kobeResetMatchesPOST } from '@/app/api/alicesoft-kobe/reset-matches/route';
import { POST as kobeResolveEgsPOST } from '@/app/api/alicesoft-kobe/resolve-egs/route';
import { POST as kobeRetryVndbPOST } from '@/app/api/alicesoft-kobe/retry-vndb-aggressive/route';
import { POST as kobeSearchEgsPOST } from '@/app/api/alicesoft-kobe/search-egs-no-vndb/route';

// backup + collection + import/order
import { POST as backupRestorePOST } from '@/app/api/backup/restore/route';
import {
  POST as collectionActivityPOST,
  DELETE as collectionActivityDELETE,
} from '@/app/api/collection/[id]/activity/route';
import { POST as collectionAssetsPOST } from '@/app/api/collection/[id]/assets/route';
import { POST as collectionImportPOST } from '@/app/api/collection/import/route';
import {
  PATCH as collectionOrderPATCH,
  DELETE as collectionOrderDELETE,
} from '@/app/api/collection/order/route';

// egs add + lists items
import { POST as egsAddPOST } from '@/app/api/egs/[id]/add/route';
import {
  POST as listsItemsPOST,
  DELETE as listsItemsDELETE,
} from '@/app/api/lists/[id]/items/route';

// proxy + refresh + settings
import { POST as proxyTestPOST } from '@/app/api/proxy/test/route';
import { POST as refreshGlobalPOST } from '@/app/api/refresh/global/route';
import { POST as refreshScopePOST } from '@/app/api/refresh/scope/route';
import { PATCH as settingsPATCH } from '@/app/api/settings/route';

// series image + stock summary
import { POST as seriesImagePOST } from '@/app/api/series/[id]/image/route';
import { POST as stockSummaryPOST } from '@/app/api/stock/summary/route';

// vn aspect + stock POST + stock aliases + stock sources
import {
  PATCH as vnAspectPATCH,
  DELETE as vnAspectDELETE,
} from '@/app/api/vn/[id]/aspect/route';
import { POST as vnStockPOST } from '@/app/api/vn/[id]/stock/route';
import { POST as vnStockAliasesPOST } from '@/app/api/vn/[id]/stock/aliases/route';
import {
  POST as vnStockSourcesPOST,
  DELETE as vnStockSourcesDELETE,
} from '@/app/api/vn/[id]/stock/sources/route';

// vndb cache + pull-statuses
import { DELETE as vndbCacheDELETE } from '@/app/api/vndb/cache/route';
import { POST as vndbPullStatusesPOST } from '@/app/api/vndb/pull-statuses/route';

function externalReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('auth gate — alicesoft-kobe routes return 403 from external origin', () => {
  const codeCtx = (code = '000-000000-000') => ({ params: Promise.resolve({ code }) });

  it('POST /api/alicesoft-kobe/[code]/link', async () => {
    const res = await kobeLinkPOST(externalReq('/api/alicesoft-kobe/000-000000-000/link', 'POST', { vn_id: 'v90001' }), codeCtx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/alicesoft-kobe/[code]/link', async () => {
    const res = await kobeLinkDELETE(externalReq('/api/alicesoft-kobe/000-000000-000/link', 'DELETE'), codeCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/download-vndb', async () => {
    const res = await kobeDownloadVndbPOST(externalReq('/api/alicesoft-kobe/download-vndb', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/fetch', async () => {
    const res = await kobeFetchPOST(externalReq('/api/alicesoft-kobe/fetch', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/match-next', async () => {
    const res = await kobeMatchNextPOST(externalReq('/api/alicesoft-kobe/match-next', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/match-vndb-from-egs', async () => {
    const res = await kobeMatchFromEgsPOST(externalReq('/api/alicesoft-kobe/match-vndb-from-egs', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/reset-matches', async () => {
    const res = await kobeResetMatchesPOST(externalReq('/api/alicesoft-kobe/reset-matches', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/resolve-egs', async () => {
    const res = await kobeResolveEgsPOST(externalReq('/api/alicesoft-kobe/resolve-egs', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/retry-vndb-aggressive', async () => {
    const res = await kobeRetryVndbPOST(externalReq('/api/alicesoft-kobe/retry-vndb-aggressive', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/alicesoft-kobe/search-egs-no-vndb', async () => {
    const res = await kobeSearchEgsPOST(externalReq('/api/alicesoft-kobe/search-egs-no-vndb', 'POST', {}));
    expect(res.status).toBe(403);
  });
});

describe('auth gate — collection mutating routes (extra) return 403 from external origin', () => {
  const vnCtx = (id = 'v90001') => ({ params: Promise.resolve({ id }) });

  it('POST /api/backup/restore', async () => {
    const res = await backupRestorePOST(externalReq('/api/backup/restore', 'POST'));
    expect(res.status).toBe(403);
  });
  it('POST /api/collection/[id]/activity', async () => {
    const res = await collectionActivityPOST(externalReq('/api/collection/v90001/activity', 'POST', { text: 'x' }), vnCtx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/collection/[id]/activity', async () => {
    const res = await collectionActivityDELETE(externalReq('/api/collection/v90001/activity?entry=1', 'DELETE'), vnCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/collection/[id]/assets', async () => {
    const res = await collectionAssetsPOST(externalReq('/api/collection/v90001/assets', 'POST'), vnCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/collection/import', async () => {
    const res = await collectionImportPOST(externalReq('/api/collection/import', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('PATCH /api/collection/order', async () => {
    const res = await collectionOrderPATCH(externalReq('/api/collection/order', 'PATCH', { ids: ['v90001'] }));
    expect(res.status).toBe(403);
  });
  it('DELETE /api/collection/order', async () => {
    const res = await collectionOrderDELETE(externalReq('/api/collection/order', 'DELETE'));
    expect(res.status).toBe(403);
  });
});

describe('auth gate — egs/add + lists items return 403 from external origin', () => {
  const egsCtx = (id = '1') => ({ params: Promise.resolve({ id }) });
  const listCtx = (id = '1') => ({ params: Promise.resolve({ id }) });

  it('POST /api/egs/[id]/add', async () => {
    const res = await egsAddPOST(externalReq('/api/egs/1/add', 'POST', { status: 'planning' }), egsCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/lists/[id]/items', async () => {
    const res = await listsItemsPOST(externalReq('/api/lists/1/items', 'POST', { vn_id: 'v90001' }), listCtx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/lists/[id]/items', async () => {
    const res = await listsItemsDELETE(externalReq('/api/lists/1/items?vn=v90001', 'DELETE'), listCtx());
    expect(res.status).toBe(403);
  });
});

describe('auth gate — proxy/refresh/settings return 403 from external origin', () => {
  it('POST /api/proxy/test', async () => {
    const res = await proxyTestPOST(externalReq('/api/proxy/test', 'POST', { provider: 'vndb' }));
    expect(res.status).toBe(403);
  });
  it('POST /api/refresh/global', async () => {
    const res = await refreshGlobalPOST(externalReq('/api/refresh/global', 'POST', {}));
    expect(res.status).toBe(403);
  });
  it('POST /api/refresh/scope', async () => {
    const res = await refreshScopePOST(externalReq('/api/refresh/scope', 'POST', { scope: 'upcoming' }));
    expect(res.status).toBe(403);
  });
  it('PATCH /api/settings', async () => {
    const res = await settingsPATCH(externalReq('/api/settings', 'PATCH', { vndb_token: 'fake-test-token-not-a-real-vndb-credential' }));
    expect(res.status).toBe(403);
  });
});

describe('auth gate — series image + stock summary return 403 from external origin', () => {
  const seriesCtx = (id = '1') => ({ params: Promise.resolve({ id }) });

  it('POST /api/series/[id]/image', async () => {
    const res = await seriesImagePOST(externalReq('/api/series/1/image', 'POST'), seriesCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/stock/summary', async () => {
    const res = await stockSummaryPOST(externalReq('/api/stock/summary', 'POST', { vnIds: ['v90001'] }));
    expect(res.status).toBe(403);
  });
});

describe('auth gate — vn/[id] mutating routes (extra) return 403 from external origin', () => {
  const vnCtx = (id = 'v90001') => ({ params: Promise.resolve({ id }) });

  it('PATCH /api/vn/[id]/aspect', async () => {
    const res = await vnAspectPATCH(externalReq('/api/vn/v90001/aspect', 'PATCH', { aspect_key: '16:9' }), vnCtx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/vn/[id]/aspect', async () => {
    const res = await vnAspectDELETE(externalReq('/api/vn/v90001/aspect', 'DELETE'), vnCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/vn/[id]/stock', async () => {
    const res = await vnStockPOST(externalReq('/api/vn/v90001/stock', 'POST', {}), vnCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/vn/[id]/stock/aliases', async () => {
    const res = await vnStockAliasesPOST(externalReq('/api/vn/v90001/stock/aliases', 'POST', { term: 'alias' }), vnCtx());
    expect(res.status).toBe(403);
  });
  it('POST /api/vn/[id]/stock/sources', async () => {
    const res = await vnStockSourcesPOST(externalReq('/api/vn/v90001/stock/sources', 'POST', { url: 'https://www.amazon.co.jp/dp/B00TEST' }), vnCtx());
    expect(res.status).toBe(403);
  });
  it('DELETE /api/vn/[id]/stock/sources', async () => {
    const res = await vnStockSourcesDELETE(externalReq('/api/vn/v90001/stock/sources', 'DELETE', { id: 1 }), vnCtx());
    expect(res.status).toBe(403);
  });
});

describe('auth gate — vndb cache + pull-statuses return 403 from external origin', () => {
  it('DELETE /api/vndb/cache', async () => {
    const res = await vndbCacheDELETE(externalReq('/api/vndb/cache', 'DELETE'));
    expect(res.status).toBe(403);
  });
  it('POST /api/vndb/pull-statuses', async () => {
    // Route signature uses raw `Request`, not `NextRequest`; the helper
    // accepts both since `requireLocalhostOrToken` only reads headers.
    const res = await vndbPullStatusesPOST(externalReq('/api/vndb/pull-statuses', 'POST', {}));
    expect(res.status).toBe(403);
  });
});
