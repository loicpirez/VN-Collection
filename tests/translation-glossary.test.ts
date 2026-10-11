import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VndbCharacter } from '@/lib/vndb-types';
import { buildTranslationGlossary } from '@/lib/translation-glossary';

const mocks = vi.hoisted(() => ({
  getCharactersForVn: vi.fn(),
  listCards: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/vndb', () => ({
  getCharactersForVn: mocks.getCharactersForVn,
}));

vi.mock('@/lib/db/repositories/collection-list', () => ({
  getCollectionListRepository: () => ({ listCards: mocks.listCards }),
}));

import { GET as gamesGET } from '@/app/api/translation-glossary/games/route';
import { GET as glossaryGET } from '@/app/api/translation-glossary/[id]/route';

function req(path: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`);
}

function character(overrides: Partial<VndbCharacter>): VndbCharacter {
  return {
    id: 'c1',
    name: 'Nagato',
    original: '長門',
    aliases: [],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [{ id: 'v1', role: 'primary', spoiler: 0 }],
    traits: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.listCards.mockResolvedValue([]);
  mocks.getCharactersForVn.mockResolvedValue([]);
});

describe('translation glossary shape', () => {
  it('keeps only useful original-to-romaji mappings and orders roles', () => {
    const value = buildTranslationGlossary('V1', [
      character({ id: 'c2', name: 'Kyon', original: 'キョン', vns: [{ id: 'v1', role: 'main', spoiler: 0 }] }),
      character({ aliases: ['Nagato Yuki', '長門', 'Nagato'], vns: [{ id: 'v1', role: 'primary', spoiler: 0 }] }),
      character({ id: 'c3', name: 'No Original', original: null }),
      character({ id: 'c4', name: 'Nagato', original: '長門' }),
    ]);
    expect(value).toEqual({
      version: 1,
      source: 'VNCollection/VNDB',
      vnId: 'v1',
      characters: [
        { id: 'c2', original: 'キョン', romaji: 'Kyon', aliases: [], role: 'main' },
        { id: 'c1', original: '長門', romaji: 'Nagato', aliases: ['Nagato Yuki'], role: 'primary' },
      ],
    });
  });
});

describe('translation glossary routes', () => {
  it('requires authorization and validates ids and pagination', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    expect((await gamesGET(req('/api/translation-glossary/games'))).status).toBe(403);
    expect((await gamesGET(req('/api/translation-glossary/games?page=0'))).status).toBe(400);
    expect((await glossaryGET(req('/api/translation-glossary/bad'), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
  });

  it('returns a bounded compact game list', async () => {
    mocks.listCards.mockResolvedValue([
      { id: 'v2', title: 'Game B', alttitle: 'ゲームB' },
      { id: 'v1', title: 'Game A', alttitle: null },
      { id: 'v3', title: 'Sentinel', alttitle: null },
    ]);
    const response = await gamesGET(req('/api/translation-glossary/games?page=2&limit=2'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      games: [
        { id: 'v2', title: 'Game B', alttitle: 'ゲームB' },
        { id: 'v1', title: 'Game A', alttitle: null },
      ],
      pagination: { page: 2, page_size: 2, returned: 2, has_more: true },
    });
    expect(mocks.listCards).toHaveBeenCalledWith({ sort: 'title', order: 'asc', limit: 3, offset: 2 });
  });

  it('fetches up to one hundred characters and returns the compact glossary', async () => {
    mocks.getCharactersForVn.mockResolvedValue([character({})]);
    const response = await glossaryGET(req('/api/translation-glossary/V1'), {
      params: Promise.resolve({ id: 'V1' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getCharactersForVn).toHaveBeenCalledWith('v1', 100, expect.any(AbortSignal));
    const body = await response.json();
    expect(body.characters).toEqual([
      { id: 'c1', original: '長門', romaji: 'Nagato', aliases: [], role: 'primary' },
    ]);
  });
});
