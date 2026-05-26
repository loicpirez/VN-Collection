import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/stock/summary/route';
import { clearVnStockCache, replaceVnStockProviderSnapshot, type VnStockOfferInput } from '@/lib/db';
import { NextRequest } from 'next/server';

const VN_A = 'v94001';
const VN_B = 'v94002';
const VN_BAD = 'not-an-id';

function makeOffer(vnId: string, provider: string, id: string, price: number): VnStockOfferInput {
  return {
    vn_id: vnId,
    provider,
    provider_offer_id: id,
    source: 'direct',
    title: `t-${id}`,
    url: `https://example.test/${id}`,
    price,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: null,
    edition_label: null,
    location_label: null,
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: Date.now(),
    error: null,
    content_kind: 'game_package',
    platform: null,
    edition_kind: null,
    series_relation: 'exact_game',
    match_confidence: 'high',
    match_score: 80,
    match_warnings_json: null,
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: null,
  };
}

function reqGet(qs: string) {
  return new NextRequest(`http://localhost/api/stock/summary?${qs}`, {
    headers: { host: '127.0.0.1' },
  });
}

function reqPost(body: unknown) {
  return new NextRequest('http://localhost/api/stock/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

function reset() {
  clearVnStockCache(VN_A);
  clearVnStockCache(VN_B);
}

beforeEach(reset);
afterEach(reset);

describe('GET /api/stock/summary', () => {
  it('returns empty summary when no ids provided', async () => {
    const res = await GET(reqGet('') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: {} });
  });

  it('ignores invalid ids and returns summaries for valid ones', async () => {
    replaceVnStockProviderSnapshot(VN_A, 'amiami', [makeOffer(VN_A, 'amiami', '1', 3300)], {
      status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1,
    });
    const res = await GET(reqGet(`ids=${VN_A},${VN_BAD}`) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary[VN_A]).toMatchObject({ available: 1, best_price: 3300 });
    expect(data.summary[VN_BAD]).toBeUndefined();
  });

  it('omits VNs with no offers from the summary', async () => {
    const res = await GET(reqGet(`ids=${VN_A},${VN_B}`) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: {} });
  });

  it('returns lowest priced offer as best_price', async () => {
    replaceVnStockProviderSnapshot(VN_A, 'amiami', [
      makeOffer(VN_A, 'amiami', '1', 3300),
      makeOffer(VN_A, 'amiami', '2', 2000),
    ], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 2 });
    const res = await GET(reqGet(`ids=${VN_A}`) as never);
    const data = await res.json();
    expect(data.summary[VN_A].best_price).toBe(2000);
  });
});

describe('POST /api/stock/summary', () => {
  it('accepts an ids array body', async () => {
    replaceVnStockProviderSnapshot(VN_A, 'amiami', [makeOffer(VN_A, 'amiami', '1', 1500)], {
      status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1,
    });
    const res = await POST(reqPost({ ids: [VN_A] }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary[VN_A]).toMatchObject({ available: 1, best_price: 1500 });
  });

  it('returns empty summary for invalid body', async () => {
    const res = await POST(reqPost({}) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: {} });
  });
});
