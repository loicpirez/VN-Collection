import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadFullCharForVn: vi.fn(),
  downloadFullProducerForVn: vi.fn(),
  downloadFullStaffForVn: vi.fn(),
  getCharacterImages: vi.fn(),
  getQuotesForVn: vi.fn(),
  getReleasesForVn: vi.fn(),
  getVnCover: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  searchCollectionByTitle: vi.fn(),
  upsertReleaseResolutionCache: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  getCharacterImages: mocks.getCharacterImages,
  getVnCover: mocks.getVnCover,
  upsertReleaseResolutionCache: mocks.upsertReleaseResolutionCache,
}));

vi.mock('@/lib/vndb', () => ({
  getQuotesForVn: mocks.getQuotesForVn,
  getReleasesForVn: mocks.getReleasesForVn,
}));

vi.mock('@/lib/steam', () => ({
  searchCollectionByTitle: mocks.searchCollectionByTitle,
}));

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffForVn: mocks.downloadFullStaffForVn,
}));

vi.mock('@/lib/character-full', () => ({
  downloadFullCharForVn: mocks.downloadFullCharForVn,
}));

vi.mock('@/lib/producer-full', () => ({
  downloadFullProducerForVn: mocks.downloadFullProducerForVn,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

import { GET as quotesGET } from '@/app/api/vn/[id]/quotes/route';
import { GET as releasesGET } from '@/app/api/vn/[id]/releases/route';
import { GET as findGET } from '@/app/api/collection/find/route';
import { POST as fullDownloadPOST } from '@/app/api/collection/full-download/route';

const VN_ID = 'v992001';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;

function req(url: string, method = 'GET', body?: Body): NextRequest {
  return new NextRequest(url.startsWith('/') ? `http://127.0.0.1${url}` : url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getQuotesForVn.mockResolvedValue([
    { id: 'q1', quote: 'Quote A', character: { id: 'c992001', name: 'Heroine A' } },
    { id: 'q2', quote: 'Quote B', character: null },
  ]);
  mocks.getCharacterImages.mockReturnValue(new Map([['c992001', { local_path: 'character/c992001.jpg' }]]));
  mocks.getVnCover.mockReturnValue({
    image_url: 'https://t.vndb.org/cv/99/992001.jpg',
    local_image: 'vn/v992001.jpg',
    local_image_thumb: 'vn/v992001-thumb.jpg',
  });
  mocks.getReleasesForVn.mockResolvedValue([
    { id: 'r992001', resolution: '1920x1080' },
    { id: 'r992002', resolution: null },
  ]);
  mocks.searchCollectionByTitle.mockReturnValue([{ id: VN_ID, title: 'VN Fixture' }]);
  mocks.downloadFullStaffForVn.mockResolvedValue(undefined);
  mocks.downloadFullCharForVn.mockResolvedValue(undefined);
  mocks.downloadFullProducerForVn.mockResolvedValue(undefined);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/vn/[id]/quotes', () => {
  it('returns auth and invalid id errors before upstream work', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await quotesGET(req(`/api/vn/${VN_ID}/quotes`), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await quotesGET(req('/api/vn/bad/quotes'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('enriches quotes with character portraits and VN cover fallback fields', async () => {
    const response = await quotesGET(req(`/api/vn/${VN_ID}/quotes`), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          id: 'q1',
          quote: 'Quote A',
          vn_image_url: 'https://t.vndb.org/cv/99/992001.jpg',
          vn_local_image: 'vn/v992001.jpg',
          vn_local_image_thumb: 'vn/v992001-thumb.jpg',
          character: {
            id: 'c992001',
            name: 'Heroine A',
            image: { local_path: 'character/c992001.jpg' },
          },
        },
        {
          id: 'q2',
          quote: 'Quote B',
          vn_image_url: 'https://t.vndb.org/cv/99/992001.jpg',
          vn_local_image: 'vn/v992001.jpg',
          vn_local_image_thumb: 'vn/v992001-thumb.jpg',
          character: null,
        },
      ],
    });
  });

  it('returns a sanitized upstream error when quote loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getQuotesForVn.mockRejectedValue(new Error('quote upstream failed'));
    const response = await quotesGET(req(`/api/vn/${VN_ID}/quotes`), ctx());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/quotes] quote upstream failed');
    consoleSpy.mockRestore();
  });
});

describe('GET /api/vn/[id]/releases', () => {
  it('returns auth and invalid id errors before upstream work', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await releasesGET(req(`/api/vn/${VN_ID}/releases`), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await releasesGET(req('/api/vn/bad/releases'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('persists release resolution cache rows while returning releases', async () => {
    const response = await releasesGET(req(`/api/vn/${VN_ID}/releases`), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      releases: [
        { id: 'r992001', resolution: '1920x1080' },
        { id: 'r992002', resolution: null },
      ],
    });
    expect(mocks.upsertReleaseResolutionCache).toHaveBeenCalledWith({
      releaseId: 'r992001',
      vnId: VN_ID,
      resolution: '1920x1080',
    });
    expect(mocks.upsertReleaseResolutionCache).toHaveBeenCalledWith({
      releaseId: 'r992002',
      vnId: VN_ID,
      resolution: null,
    });
  });

  it('returns a sanitized upstream error when release loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getReleasesForVn.mockRejectedValue(new Error('release upstream failed'));
    const response = await releasesGET(req(`/api/vn/${VN_ID}/releases`), ctx());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/releases] release upstream failed');
    consoleSpy.mockRestore();
  });
});

describe('GET /api/collection/find', () => {
  it('guards and clamps collection title lookup queries', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await findGET(req('/api/collection/find?q=test'));
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const longQuery = 'a'.repeat(350);
    const response = await findGET(req(`/api/collection/find?q=${longQuery}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ matches: [{ id: VN_ID, title: 'VN Fixture' }] });
    expect(mocks.searchCollectionByTitle).toHaveBeenCalledWith('a'.repeat(300), 12);

    await findGET(req('/api/collection/find'));
    expect(mocks.searchCollectionByTitle).toHaveBeenLastCalledWith('', 12);
  });
});

describe('POST /api/collection/full-download', () => {
  it('returns auth and payload validation errors before queuing fan-outs', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await fullDownloadPOST(req('/api/collection/full-download', 'POST', { vn_ids: [VN_ID] }));
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const shapeResponse = await fullDownloadPOST(req('/api/collection/full-download', 'POST', {}));
    expect(shapeResponse.status).toBe(400);
    await expect(shapeResponse.json()).resolves.toEqual({ error: 'vn_ids must be an array' });

    const tooManyResponse = await fullDownloadPOST(req('/api/collection/full-download', 'POST', {
      vn_ids: Array.from({ length: 201 }, (_value, index) => `v${992100 + index}`),
    }));
    expect(tooManyResponse.status).toBe(429);
    await expect(tooManyResponse.json()).resolves.toEqual({ error: 'vn_ids exceeds limit of 200' });

    const invalidResponse = await fullDownloadPOST(req('/api/collection/full-download', 'POST', { vn_ids: ['bad'] }));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'vn_ids must contain only VNDB VN ids' });
  });

  it('returns queued zero without recording activity for an empty request', async () => {
    const response = await fullDownloadPOST(req('/api/collection/full-download', 'POST', { vn_ids: [] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ queued: 0 });
    expect(mocks.recordActivity).not.toHaveBeenCalled();
  });

  it('deduplicates ids, queues fan-outs, records activity, and logs async fan-out failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.downloadFullStaffForVn.mockRejectedValue(new Error('staff failed'));
    mocks.downloadFullCharForVn.mockRejectedValue(new Error('character failed'));
    mocks.downloadFullProducerForVn.mockRejectedValue(new Error('producer failed'));
    const response = await fullDownloadPOST(req('/api/collection/full-download', 'POST', {
      vn_ids: [VN_ID.toUpperCase(), VN_ID, 'v992002'],
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, queued: 2 });
    expect(mocks.downloadFullStaffForVn).toHaveBeenCalledWith(VN_ID, { force: true });
    expect(mocks.downloadFullCharForVn).toHaveBeenCalledWith(VN_ID, { force: true });
    expect(mocks.downloadFullProducerForVn).toHaveBeenCalledWith(VN_ID, { force: true });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'download.full',
      entity: 'collection',
      entityId: 'selected',
      label: 'Full data download',
      payload: { count: 2, vn_ids: [VN_ID, 'v992002'] },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleSpy).toHaveBeenCalledWith(`[full-download:${VN_ID}] staff:`, 'staff failed');
    expect(consoleSpy).toHaveBeenCalledWith(`[full-download:${VN_ID}] characters:`, 'character failed');
    expect(consoleSpy).toHaveBeenCalledWith(`[full-download:${VN_ID}] producers:`, 'producer failed');
    consoleSpy.mockRestore();
  });
});
