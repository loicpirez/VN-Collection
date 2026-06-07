import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
  getCharacterImage: vi.fn(),
  getRandomLocalQuote: vi.fn(),
  getRandomQuote: vi.fn(),
  getVnCover: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  tooManyRequests: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/rate-limit-response', () => ({
  tooManyRequests: mocks.tooManyRequests,
}));

vi.mock('@/lib/db', () => ({
  getAppSetting: mocks.getAppSetting,
  getCharacterImage: mocks.getCharacterImage,
  getRandomLocalQuote: mocks.getRandomLocalQuote,
  getVnCover: mocks.getVnCover,
}));

vi.mock('@/lib/vndb', () => ({
  getRandomQuote: mocks.getRandomQuote,
}));

import { GET } from '@/app/api/vndb/quote/random/route';

function req(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/vndb/quote/random');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.tooManyRequests.mockReturnValue(null);
  mocks.getAppSetting.mockReturnValue('all');
  mocks.getRandomLocalQuote.mockReturnValue(null);
  mocks.getVnCover.mockReturnValue(null);
  mocks.getCharacterImage.mockReturnValue(null);
  mocks.getRandomQuote.mockResolvedValue({
    id: 'q990001',
    quote: 'A quote',
    score: 5,
    vn: { id: 'v990001', title: 'VN Fixture' },
    character: null,
  });
});

describe('GET /api/vndb/quote/random route branches', () => {
  it('returns auth and rate-limit responses before loading quote settings', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await GET(req());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const limited = NextResponse.json({ error: 'too many requests' }, { status: 429 });
    mocks.tooManyRequests.mockReturnValueOnce(limited);
    const limitedResponse = await GET(req());
    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({ error: 'too many requests' });
  });

  it('returns a fully local quote when the mine source has a row', async () => {
    mocks.getAppSetting.mockReturnValue('mine');
    mocks.getRandomLocalQuote.mockReturnValue({
      quote_id: 'local-q1',
      quote: 'Local quote',
      score: 8,
      vn_id: 'v990002',
      vn_title: 'Local VN',
      vn_image_url: 'https://t.vndb.org/cv/99/990002.jpg',
      vn_local_image: 'vn/v990002.jpg',
      vn_local_image_thumb: 'vn/v990002-thumb.jpg',
      character_id: 'c990002',
      character_name: 'Heroine A',
      character_local_image: 'character/c990002.jpg',
    });
    const response = await GET(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quote: {
        id: 'local-q1',
        quote: 'Local quote',
        score: 8,
        vn: {
          id: 'v990002',
          title: 'Local VN',
          image_url: 'https://t.vndb.org/cv/99/990002.jpg',
          local_image: 'vn/v990002.jpg',
          local_image_thumb: 'vn/v990002-thumb.jpg',
        },
        character: {
          id: 'c990002',
          name: 'Heroine A',
          original: null,
          image: { local_path: 'character/c990002.jpg' },
        },
      },
      source: 'mine',
    });
    expect(mocks.getRandomQuote).not.toHaveBeenCalled();
  });

  it('falls back to VNDB when the local mine source is empty', async () => {
    mocks.getAppSetting.mockReturnValue('mine');
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; quote: { id: string } };
    expect(body).toMatchObject({ source: 'all', quote: { id: 'q990001' } });
    expect(mocks.getRandomQuote).toHaveBeenCalledOnce();
  });

  it('defaults to the global VNDB source when no quote setting is stored', async () => {
    mocks.getAppSetting.mockReturnValue(null);
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; quote: { id: string } };
    expect(body).toMatchObject({ source: 'all', quote: { id: 'q990001' } });
  });

  it('returns a local quote character with blank name and no image when local portrait is missing', async () => {
    mocks.getAppSetting.mockReturnValue('mine');
    mocks.getRandomLocalQuote.mockReturnValue({
      quote_id: 'local-q2',
      quote: 'Local quote without portrait',
      score: 6,
      vn_id: 'v990004',
      vn_title: 'Local VN 2',
      vn_image_url: null,
      vn_local_image: null,
      vn_local_image_thumb: null,
      character_id: 'c990004',
      character_name: null,
      character_local_image: null,
    });
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json() as { quote: { character: { name: string; image: null } } };
    expect(body.quote.character).toMatchObject({ name: '', image: null });
  });

  it('enriches VNDB quotes with local VN cover and character image rows', async () => {
    mocks.getRandomQuote.mockResolvedValue({
      id: 'q990003',
      quote: 'Remote quote',
      score: 7,
      vn: { id: 'v990003', title: 'Remote VN' },
      character: { id: 'c990003', name: 'Heroine B' },
    });
    mocks.getVnCover.mockReturnValue({
      image_url: 'https://t.vndb.org/cv/99/990003.jpg',
      local_image: 'vn/v990003.jpg',
      local_image_thumb: 'vn/v990003-thumb.jpg',
    });
    mocks.getCharacterImage.mockReturnValue({ local_path: 'character/c990003.jpg' });
    const response = await GET(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quote: {
        id: 'q990003',
        quote: 'Remote quote',
        score: 7,
        vn: {
          id: 'v990003',
          title: 'Remote VN',
          image_url: 'https://t.vndb.org/cv/99/990003.jpg',
          local_image: 'vn/v990003.jpg',
          local_image_thumb: 'vn/v990003-thumb.jpg',
        },
        character: {
          id: 'c990003',
          name: 'Heroine B',
          image: { local_path: 'character/c990003.jpg' },
        },
      },
      source: 'all',
    });
  });

  it('does not request local cover or portrait rows when VNDB quote lacks VN and character ids', async () => {
    mocks.getRandomQuote.mockResolvedValue({
      id: 'q990004',
      quote: 'Remote quote without ids',
      score: 3,
      vn: null,
      character: null,
    });
    const response = await GET(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quote: {
        id: 'q990004',
        quote: 'Remote quote without ids',
        score: 3,
        vn: null,
        character: null,
      },
      source: 'all',
    });
    expect(mocks.getVnCover).not.toHaveBeenCalled();
    expect(mocks.getCharacterImage).not.toHaveBeenCalled();
  });

  it('can enrich a VNDB quote with cover fields even when the upstream VN object is absent', async () => {
    mocks.getRandomQuote.mockResolvedValue({
      id: 'q990005',
      quote: 'Remote quote with implicit VN',
      score: 4,
      vn: { id: 'v990005' },
      character: null,
    });
    mocks.getVnCover.mockReturnValue({
      image_url: 'https://t.vndb.org/cv/99/990005.jpg',
      local_image: 'vn/v990005.jpg',
      local_image_thumb: 'vn/v990005-thumb.jpg',
    });
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json() as { quote: { vn: { id: string; image_url: string } } };
    expect(body.quote.vn).toMatchObject({
      id: 'v990005',
      image_url: 'https://t.vndb.org/cv/99/990005.jpg',
    });
  });

  it('returns null quote envelopes from VNDB without enrichment', async () => {
    mocks.getRandomQuote.mockResolvedValue(null);
    const response = await GET(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ quote: null, source: 'all' });
  });

  it('returns a sanitized upstream error when VNDB quote loading throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getRandomQuote.mockRejectedValue(new Error('upstream failed'));
    const response = await GET(req());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vndb/quote/random] upstream failed');
    consoleSpy.mockRestore();
  });
});
