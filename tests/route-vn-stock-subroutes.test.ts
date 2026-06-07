import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  db,
  deleteStockSource,
  getErogePriceStockExtras,
  listStockAliases,
  listStockSources,
  setStockProviderExtras,
  upsertStockSource,
} from '@/lib/db';

const { fetchBundleMock } = vi.hoisted(() => ({ fetchBundleMock: vi.fn() }));

vi.mock('@/lib/erogeprice-meta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogeprice-meta')>();
  return { ...actual, fetchErogePriceBundle: fetchBundleMock };
});

import { GET as sourcesGET, DELETE as sourcesDELETE } from '@/app/api/vn/[id]/stock/sources/route';
import { GET as aliasesGET, POST as aliasesPOST } from '@/app/api/vn/[id]/stock/aliases/route';
import {
  PATCH as epPATCH,
  POST as epPOST,
  DELETE as epDELETE,
} from '@/app/api/vn/[id]/stock/eroge-price/route';

const VN = 'v90501';

function localReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = VN) {
  return { params: Promise.resolve({ id }) };
}

/** Build a minimal valid eroge_price extras envelope for one candidate. */
function seedExtras(epIds: number[], selected: number | null): void {
  setStockProviderExtras(VN, 'eroge_price', {
    schemaVersion: 1,
    candidates: epIds.map((epId) => ({
      epId,
      gameUrl: `https://eroge-price.com/games/${epId}`,
      detail: { id: epId, title: `Candidate ${epId}` },
      priceStats: {},
      priceHistory: [],
      related: {},
      fetchedAt: Date.now(),
    })),
    selectedEpId: selected,
    searchQuery: null,
    refreshedAt: Date.now(),
  });
}

function clear(): void {
  for (const s of listStockSources(VN)) deleteStockSource(VN, s.id);
  for (const a of listStockAliases(VN)) db.prepare('DELETE FROM vn_stock_alias WHERE vn_id = ? AND alias_term = ?').run(VN, a.alias_term);
  db.prepare('DELETE FROM vn_stock_provider_status WHERE vn_id = ?').run(VN);
}

beforeEach(() => {
  fetchBundleMock.mockReset();
  clear();
});

afterEach(clear);

describe('GET /api/vn/[id]/stock/sources', () => {
  it('400 on an invalid id', async () => {
    const res = await sourcesGET(localReq('/api/vn/bad/stock/sources', 'GET'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 with the sources array', async () => {
    upsertStockSource({ vn_id: VN, provider: 'amazon_jp', url: 'https://www.amazon.co.jp/dp/B000000111', product_id: 'B000000111' });
    const res = await sourcesGET(localReq('/api/vn/v90501/stock/sources', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].provider).toBe('amazon_jp');
  });

  it('403 before reading sources when the request is not local or tokened', async () => {
    const res = await sourcesGET(new NextRequest('http://example.com/api/vn/v90501/stock/sources'), ctx());
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/vn/[id]/stock/sources', () => {
  it('400 when no source id is supplied', async () => {
    const res = await sourcesDELETE(localReq('/api/vn/v90501/stock/sources', 'DELETE', {}), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('source id required');
  });

  it('400 on an invalid source delete VN id', async () => {
    const res = await sourcesDELETE(localReq('/api/vn/bad/stock/sources', 'DELETE', { id: 1 }), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 and removes the requested source', async () => {
    upsertStockSource({ vn_id: VN, provider: 'amazon_jp', url: 'https://www.amazon.co.jp/dp/B000000222', product_id: 'B000000222' });
    const [row] = listStockSources(VN);
    const res = await sourcesDELETE(localReq('/api/vn/v90501/stock/sources', 'DELETE', { id: row.id }), ctx());
    expect(res.status).toBe(200);
    expect(listStockSources(VN)).toHaveLength(0);
  });

  it('200 and accepts source_id as the delete body key', async () => {
    upsertStockSource({ vn_id: VN, provider: 'amazon_jp', url: 'https://www.amazon.co.jp/dp/B000000333', product_id: 'B000000333' });
    const [row] = listStockSources(VN);
    const res = await sourcesDELETE(localReq('/api/vn/v90501/stock/sources', 'DELETE', { source_id: row.id }), ctx());
    expect(res.status).toBe(200);
    expect(listStockSources(VN)).toHaveLength(0);
  });
});

describe('GET /api/vn/[id]/stock/aliases', () => {
  it('400 on an invalid id', async () => {
    const res = await aliasesGET(localReq('/api/vn/bad/stock/aliases', 'GET'), ctx('bad'));
    expect(res.status).toBe(400);
  });

  it('200 with the aliases array', async () => {
    const res = await aliasesGET(localReq('/api/vn/v90501/stock/aliases', 'GET'), ctx());
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).aliases)).toBe(true);
  });

  it('403 before reading aliases when the request is not local or tokened', async () => {
    const res = await aliasesGET(new NextRequest('http://example.com/api/vn/v90501/stock/aliases'), ctx());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/vn/[id]/stock/aliases', () => {
  it('400 when the term is empty', async () => {
    const res = await aliasesPOST(localReq('/api/vn/v90501/stock/aliases', 'POST', { term: '', action: 'add' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('term required');
  });

  it('400 on an invalid alias POST VN id', async () => {
    const res = await aliasesPOST(localReq('/api/vn/bad/stock/aliases', 'POST', { term: 'alias', action: 'add' }), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('400 when the alias term is not a string', async () => {
    const res = await aliasesPOST(localReq('/api/vn/v90501/stock/aliases', 'POST', { term: 123, action: 'add' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('term required');
  });

  it('400 on an unknown action', async () => {
    const res = await aliasesPOST(localReq('/api/vn/v90501/stock/aliases', 'POST', { term: 'alias one', action: 'frobnicate' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('action must be add or delete');
  });

  it('200 and adds the alias', async () => {
    const res = await aliasesPOST(localReq('/api/vn/v90501/stock/aliases', 'POST', { term: 'alternate title', action: 'add' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).aliases).toContain('alternate title');
  });
});

describe('PATCH /api/vn/[id]/stock/eroge-price', () => {
  it('400 when ep_id is missing', async () => {
    const res = await epPATCH(localReq('/api/vn/v90501/stock/eroge-price', 'PATCH', {}), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ep_id required/);
  });

  it('403 before patching eroge-price extras when the request is not local or tokened', async () => {
    const res = await epPATCH(new NextRequest('http://example.com/api/vn/v90501/stock/eroge-price', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ep_id: 100 }),
    }), ctx());
    expect(res.status).toBe(403);
  });

  it('404 when no extras are stored for the VN', async () => {
    const res = await epPATCH(localReq('/api/vn/v90501/stock/eroge-price', 'PATCH', { ep_id: 5 }), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no eroge_price extras stored for this VN');
  });

  it('400 when ep_id is not among the stored candidates', async () => {
    seedExtras([100, 200], 100);
    const res = await epPATCH(localReq('/api/vn/v90501/stock/eroge-price', 'PATCH', { ep_id: 999 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ep_id not in candidates');
  });

  it('200 and pins the selected candidate', async () => {
    seedExtras([100, 200], 100);
    const res = await epPATCH(localReq('/api/vn/v90501/stock/eroge-price', 'PATCH', { ep_id: 200 }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).selectedEpId).toBe(200);
    expect(getErogePriceStockExtras(VN)?.selectedEpId).toBe(200);
  });
});

describe('POST /api/vn/[id]/stock/eroge-price', () => {
  it('400 when ep_id is missing', async () => {
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', {}), ctx());
    expect(res.status).toBe(400);
  });

  it('403 before adding eroge-price candidates when the request is not local or tokened', async () => {
    const res = await epPOST(new NextRequest('http://example.com/api/vn/v90501/stock/eroge-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ep_id: 777 }),
    }), ctx());
    expect(res.status).toBe(403);
  });

  it('400 on an invalid VN id before adding an eroge-price candidate', async () => {
    const res = await epPOST(localReq('/api/vn/bad/stock/eroge-price', 'POST', { ep_id: 777 }), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 (already present) without fetching when the candidate exists', async () => {
    seedExtras([100], 100);
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', { ep_id: 100 }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('already present');
    expect(fetchBundleMock).not.toHaveBeenCalled();
  });

  it('404 when eroge-price returns no detail for the ep_id', async () => {
    fetchBundleMock.mockResolvedValue(null);
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', { ep_id: 555 }), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no detail/);
  });

  it('502 when the eroge-price fetch throws', async () => {
    fetchBundleMock.mockRejectedValue(new Error('socket reset'));
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', { ep_id: 556 }), ctx());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/eroge-price fetch failed/);
  });

  it('200 and appends a freshly-fetched candidate', async () => {
    fetchBundleMock.mockResolvedValue({
      epId: 777,
      gameUrl: 'https://eroge-price.com/games/777',
      detail: { id: 777, title: 'Fetched' },
      priceStats: {},
      priceHistory: [],
      related: {},
      fetchedAt: Date.now(),
    });
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', { ep_id: 777 }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).candidates).toContain(777);
  });

  it('200 and appends a freshly-fetched candidate to existing extras', async () => {
    seedExtras([100], 100);
    fetchBundleMock.mockResolvedValue({
      epId: 888,
      gameUrl: 'https://eroge-price.com/games/888',
      detail: { id: 888, title: 'Fetched extra' },
      priceStats: {},
      priceHistory: [],
      related: {},
      fetchedAt: Date.now(),
    });
    const res = await epPOST(localReq('/api/vn/v90501/stock/eroge-price', 'POST', { ep_id: 888 }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([100, 888]);
    expect(body.selectedEpId).toBe(100);
  });
});

describe('DELETE /api/vn/[id]/stock/eroge-price', () => {
  it('400 when the ep_id query param is missing', async () => {
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price', 'DELETE'), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ep_id query param required');
  });

  it('403 before deleting eroge-price candidates when the request is not local or tokened', async () => {
    const res = await epDELETE(new NextRequest('http://example.com/api/vn/v90501/stock/eroge-price?ep_id=5', {
      method: 'DELETE',
    }), ctx());
    expect(res.status).toBe(403);
  });

  it('400 on an invalid VN id before deleting an eroge-price candidate', async () => {
    const res = await epDELETE(localReq('/api/vn/bad/stock/eroge-price?ep_id=5', 'DELETE'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 (no extras) when nothing is stored', async () => {
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price?ep_id=5', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe('no extras to remove from');
  });

  it('400 when the ep_id is not a stored candidate', async () => {
    seedExtras([100, 200], 100);
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price?ep_id=999', 'DELETE'), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ep_id not in candidates');
  });

  it('200 and clears the blob when the last candidate is removed', async () => {
    seedExtras([100], 100);
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price?ep_id=100', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cleared: true, candidates: [] });
  });

  it('200 and re-points selection when a non-last candidate is removed', async () => {
    seedExtras([100, 200], 100);
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price?ep_id=100', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([200]);
    expect(body.selectedEpId).toBe(200);
  });

  it('200 and keeps the selected candidate when deleting a different candidate', async () => {
    seedExtras([100, 200], 200);
    const res = await epDELETE(localReq('/api/vn/v90501/stock/eroge-price?egs_id=100', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([200]);
    expect(body.selectedEpId).toBe(200);
  });
});
