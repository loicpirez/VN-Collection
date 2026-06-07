import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addVnToSeries: vi.fn(),
  getSeries: vi.fn(),
  isInCollection: vi.fn(),
  isInCollectionMany: vi.fn(),
  listListsForVn: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  removeVnFromSeries: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  searchTags: vi.fn(),
  searchTextual: vi.fn(),
  searchTraits: vi.fn(),
  tooManyRequests: vi.fn(),
  transaction: vi.fn(),
  walkSeriesRelations: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  addVnToSeries: mocks.addVnToSeries,
  db: { transaction: mocks.transaction },
  getSeries: mocks.getSeries,
  isInCollection: mocks.isInCollection,
  isInCollectionMany: mocks.isInCollectionMany,
  listListsForVn: mocks.listListsForVn,
  removeVnFromSeries: mocks.removeVnFromSeries,
  searchTextual: mocks.searchTextual,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

vi.mock('@/lib/series-detect', () => ({
  walkSeriesRelations: mocks.walkSeriesRelations,
}));

vi.mock('@/lib/rate-limit-response', () => ({
  tooManyRequests: mocks.tooManyRequests,
}));

vi.mock('@/lib/vndb', () => ({
  searchTags: mocks.searchTags,
  searchTraits: mocks.searchTraits,
}));

import {
  DELETE as seriesVnDELETE,
  POST as seriesVnPOST,
} from '@/app/api/series/[id]/vn/[vnId]/route';
import { GET as vnListsGET } from '@/app/api/vn/[id]/lists/route';
import { GET as textualGET } from '@/app/api/search/textual/route';
import { GET as tagsGET } from '@/app/api/tags/route';
import { GET as traitsGET } from '@/app/api/traits/route';

const SERIES_ID = 9;
const VN_ID = 'v991001';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;

function jsonReq(url: string, method = 'GET', body?: Body): NextRequest {
  const absoluteUrl = url.startsWith('/') ? `http://127.0.0.1${url}` : url;
  return new NextRequest(absoluteUrl, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function seriesCtx(id = String(SERIES_ID), vnId = VN_ID): { params: Promise<{ id: string; vnId: string }> } {
  return { params: Promise.resolve({ id, vnId }) };
}

function vnCtx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getSeries.mockReturnValue({ id: SERIES_ID, name: 'Series Fixture' });
  mocks.isInCollection.mockReturnValue(true);
  mocks.isInCollectionMany.mockReturnValue(new Set(['v991002']));
  mocks.listListsForVn.mockReturnValue([{ id: 1, name: 'List Fixture' }]);
  mocks.searchTextual.mockReturnValue([{ id: VN_ID, title: 'VN Fixture' }]);
  mocks.searchTags.mockResolvedValue([{ id: 'g991001', name: 'Tag Fixture' }]);
  mocks.searchTraits.mockResolvedValue([{ id: 'i991001', name: 'Trait Fixture' }]);
  mocks.tooManyRequests.mockReturnValue(null);
  mocks.transaction.mockImplementation((fn: () => void) => fn);
  mocks.walkSeriesRelations.mockReturnValue([{ id: 'v991002' }, { id: 'v991003' }]);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('POST /api/series/[id]/vn/[vnId]', () => {
  it('returns auth and validation errors before linking', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await seriesVnPOST(jsonReq('/api/series/9/vn/v991001', 'POST'), seriesCtx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const seriesIdResponse = await seriesVnPOST(jsonReq('/api/series/bad/vn/v991001', 'POST'), seriesCtx('bad'));
    expect(seriesIdResponse.status).toBe(400);
    await expect(seriesIdResponse.json()).resolves.toEqual({ error: 'invalid series id' });

    mocks.getSeries.mockReturnValueOnce(null);
    const missingSeriesResponse = await seriesVnPOST(jsonReq('/api/series/9/vn/v991001', 'POST'), seriesCtx());
    expect(missingSeriesResponse.status).toBe(404);
    await expect(missingSeriesResponse.json()).resolves.toEqual({ error: 'series not found' });

    const invalidVnResponse = await seriesVnPOST(jsonReq('/api/series/9/vn/bad', 'POST'), seriesCtx('9', 'bad'));
    expect(invalidVnResponse.status).toBe(400);
    await expect(invalidVnResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValueOnce(false);
    const collectionResponse = await seriesVnPOST(jsonReq('/api/series/9/vn/v991001', 'POST'), seriesCtx());
    expect(collectionResponse.status).toBe(400);
    await expect(collectionResponse.json()).resolves.toEqual({ error: 'add VN to collection first' });
  });

  it.each([
    [{ order_index: -1 }, 'order_index must be a non-negative integer'],
    [{ order_index: 1.5 }, 'order_index must be a non-negative integer'],
    [{ expand: 'yes' }, 'expand must be boolean'],
  ] satisfies Array<[Body, string]>)('rejects malformed series link body %j', async (body, error) => {
    const response = await seriesVnPOST(jsonReq('/api/series/9/vn/v991001', 'POST', body), seriesCtx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('links the seed VN and expands owned related VNs in one transaction', async () => {
    const response = await seriesVnPOST(jsonReq('/api/series/9/vn/V991001', 'POST', {
      order_index: 4,
      expand: true,
    }), seriesCtx('9', 'V991001'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      series: { id: SERIES_ID, name: 'Series Fixture' },
      added: ['v991001', 'v991002'],
    });
    expect(mocks.addVnToSeries).toHaveBeenCalledWith(SERIES_ID, 'v991001', 4);
    expect(mocks.addVnToSeries).toHaveBeenCalledWith(SERIES_ID, 'v991002', 5);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'series.link',
      entity: 'series',
      entityId: String(SERIES_ID),
      label: 'Linked VN to series',
      payload: { added_count: 2, expanded: true },
    });
  });

  it('still links when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await seriesVnPOST(jsonReq('/api/series/9/vn/v991001', 'POST'), seriesCtx());
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[series:${SERIES_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/series/[id]/vn/[vnId]', () => {
  it('returns auth and validation errors before unlinking', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await seriesVnDELETE(jsonReq('/api/series/9/vn/v991001', 'DELETE'), seriesCtx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const seriesIdResponse = await seriesVnDELETE(jsonReq('/api/series/bad/vn/v991001', 'DELETE'), seriesCtx('bad'));
    expect(seriesIdResponse.status).toBe(400);
    await expect(seriesIdResponse.json()).resolves.toEqual({ error: 'invalid series id' });

    const vnIdResponse = await seriesVnDELETE(jsonReq('/api/series/9/vn/bad', 'DELETE'), seriesCtx('9', 'bad'));
    expect(vnIdResponse.status).toBe(400);
    await expect(vnIdResponse.json()).resolves.toEqual({ error: 'invalid vn id' });
  });

  it('unlinks a VN from a series and records activity', async () => {
    const response = await seriesVnDELETE(jsonReq('/api/series/9/vn/V991001', 'DELETE'), seriesCtx('9', 'V991001'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ series: { id: SERIES_ID, name: 'Series Fixture' } });
    expect(mocks.removeVnFromSeries).toHaveBeenCalledWith(SERIES_ID, 'v991001');
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'series.unlink',
      entity: 'series',
      entityId: String(SERIES_ID),
      label: 'Unlinked VN from series',
      payload: { vn_id: 'v991001' },
    });
  });
});

describe('GET /api/vn/[id]/lists and /api/search/textual', () => {
  it('guards and validates VN list lookup', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await vnListsGET(jsonReq('/api/vn/v991001/lists'), vnCtx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await vnListsGET(jsonReq('/api/vn/bad/lists'), vnCtx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    const response = await vnListsGET(jsonReq('/api/vn/V991001/lists'), vnCtx('V991001'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ lists: [{ id: 1, name: 'List Fixture' }] });
    expect(mocks.listListsForVn).toHaveBeenCalledWith('v991001');
  });

  it('guards textual search and clamps query length before searching', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await textualGET(jsonReq('/api/search/textual?q=abc'));
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const longQuery = 'x'.repeat(350);
    const response = await textualGET(jsonReq(`/api/search/textual?q=${longQuery}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ hits: [{ id: VN_ID, title: 'VN Fixture' }] });
    expect(mocks.searchTextual).toHaveBeenCalledWith('x'.repeat(300), 50);

    await textualGET(jsonReq('/api/search/textual'));
    expect(mocks.searchTextual).toHaveBeenLastCalledWith('', 50);
  });
});

describe('GET /api/tags and /api/traits', () => {
  it('guards tags, rate limits them, clamps inputs, and maps upstream failures', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await tagsGET(jsonReq('/api/tags?q=test'));
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const limited = NextResponse.json({ error: 'too many requests' }, { status: 429 });
    mocks.tooManyRequests.mockReturnValueOnce(limited);
    const limitedResponse = await tagsGET(jsonReq('/api/tags?q=test'));
    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({ error: 'too many requests' });

    const response = await tagsGET(jsonReq(`/api/tags?q=${'a'.repeat(250)}&category=${'b'.repeat(40)}&results=999`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tags: [{ id: 'g991001', name: 'Tag Fixture' }] });
    expect(mocks.searchTags).toHaveBeenCalledWith('a'.repeat(200), { results: 200, category: 'b'.repeat(32) });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.searchTags.mockRejectedValue(new Error('tag upstream failed'));
    const errorResponse = await tagsGET(jsonReq('/api/tags?q=test'));
    expect(errorResponse.status).toBe(502);
    await expect(errorResponse.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:tags] tag upstream failed');
    consoleSpy.mockRestore();
  });

  it('guards traits, rate limits them, clamps results, and maps upstream failures', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await traitsGET(jsonReq('/api/traits?q=test'));
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const limited = NextResponse.json({ error: 'too many requests' }, { status: 429 });
    mocks.tooManyRequests.mockReturnValueOnce(limited);
    const limitedResponse = await traitsGET(jsonReq('/api/traits?q=test'));
    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({ error: 'too many requests' });

    const response = await traitsGET(jsonReq(`/api/traits?q=${'c'.repeat(250)}&results=0`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ traits: [{ id: 'i991001', name: 'Trait Fixture' }] });
    expect(mocks.searchTraits).toHaveBeenCalledWith('c'.repeat(200), { results: 1 });

    await traitsGET(jsonReq('/api/traits'));
    expect(mocks.searchTraits).toHaveBeenLastCalledWith('', { results: 50 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.searchTraits.mockRejectedValue(new Error('trait upstream failed'));
    const errorResponse = await traitsGET(jsonReq('/api/traits?q=test'));
    expect(errorResponse.status).toBe(502);
    await expect(errorResponse.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:traits] trait upstream failed');
    consoleSpy.mockRestore();
  });
});
