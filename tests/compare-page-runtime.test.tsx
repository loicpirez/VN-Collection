import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ComparePage, { generateMetadata } from '@/app/compare/page';
import { getCollectionItem } from '@/lib/db';
import { findSharedVasForVns, type SharedVa } from '@/lib/compare-credits';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionItem } from '@/lib/types';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: () => ({ all: dbMocks.all }),
  },
  getCollectionItem: vi.fn(),
}));

vi.mock('@/lib/compare-credits', () => ({
  findSharedVasForVns: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options?: { loading?: () => React.ReactNode }) => {
    void loader();
    return ({ initialVns }: { initialVns: unknown[] }) => (
      <>
        {options?.loading?.()}
        <pre data-testid="picker">{JSON.stringify(initialVns)}</pre>
      </>
    );
  },
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, src }: { alt: string; localSrc?: string | null; src?: string | null }) => (
    <img alt={alt} data-local-src={localSrc ?? ''} src={src ?? ''} />
  ),
}));

vi.mock('@/components/LangFlag', () => ({
  LangList: ({ langs }: { langs: string[] }) => <span data-testid="langs">{langs.join(',')}</span>,
}));

function collectionItem(id: string, overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id,
    title: `VN ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: [],
    platforms: [],
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    release_images: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    relations: [],
    aliases: [],
    extlinks: [],
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: [],
    editions: [],
    staff: [],
    va: [],
    fetched_at: 1,
    ...overrides,
  };
}

function sharedVa(index: number, overrides: Partial<SharedVa> = {}): SharedVa {
  return {
    sid: `s${index}`,
    va_name: `Actor ${index}`,
    va_original: null,
    creditsByVn: [
      { vn_id: 'v1', characters: [{ c_id: `c${index}`, c_name: `Character ${index}` }] },
      { vn_id: 'v2', characters: [{ c_id: `c${index + 20}`, c_name: `Other ${index}` }] },
    ],
    totalCharacters: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getCollectionItem).mockReset().mockReturnValue(null);
  vi.mocked(findSharedVasForVns).mockReset().mockReturnValue([]);
  dbMocks.all.mockReset().mockReturnValue([]);
});

describe('compare page runtime', () => {
  it('renders metadata and an empty picker without querying shared characters', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.compareView.pageTitle });
    await import('@/components/CompareVnPicker');

    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('data-testid="picker">[]');
    expect(html).not.toContain(dictionaries.en.compareView.common.similarity);
    expect(dbMocks.all).not.toHaveBeenCalled();
    expect(findSharedVasForVns).toHaveBeenCalledWith([]);
  });

  it('normalizes valid ids, limits the picker to four rows, and reports dropped rows', async () => {
    vi.mocked(getCollectionItem).mockImplementation((id) => id === 'v1' ? collectionItem('v1') : null);

    let html = renderToStaticMarkup(await ComparePage({
      searchParams: Promise.resolve({ ids: ' V1, invalid, v2, v3, v4, v5 ' }),
    }));

    expect(getCollectionItem).toHaveBeenCalledTimes(4);
    expect(getCollectionItem).not.toHaveBeenCalledWith('v5');
    expect(html).toContain('v2, v3, v4');
    expect(html).toContain(dictionaries.en.compareView.droppedNotice.replace('{n}', '3'));

    html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ ids: 'v1,v404' }) }));
    expect(html).toContain(dictionaries.en.compareView.droppedNoticeSingular.replace('{n}', '1'));
    expect(html).toContain('v404');
  });

  it('renders an empty-overlap matrix for two sparse rows', async () => {
    vi.mocked(getCollectionItem).mockImplementation((id) => collectionItem(id));

    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ ids: 'v1,v2' }) }));

    expect(html).toContain(`${dictionaries.en.compareView.common.similarity}: <span class="font-bold text-accent">0%</span>`);
    expect(html).toContain('data-testid="langs"></span>');
    expect(html).toContain('text-muted/60">-</span>');
    expect(html).not.toContain(dictionaries.en.compareView.common.characters);
  });

  it('renders rich shared facets, shared voices, recurring characters, and matrix overflow', async () => {
    const sharedStaff = Array.from({ length: 13 }, (_unused, index) => ({
      eid: null,
      role: index === 0 ? '' : 'scenario',
      note: null,
      id: `s${index + 1}`,
      aid: index + 1,
      name: `Staff ${index + 1}`,
      original: null,
      lang: null,
    }));
    const vaCredits = Array.from({ length: 11 }, (_unused, index) => ({
      note: index === 0 ? 'Lead' : null,
      character: { id: `c${index + 1}`, name: `Character ${index + 1}`, original: null },
      staff: { id: `s${index + 1}`, aid: index + 1, name: `Actor ${index + 1}`, original: null, lang: null },
    }));
    const first = collectionItem('v1', {
      title: 'First VN',
      alttitle: 'First alternate',
      local_image_thumb: 'first-thumb.jpg',
      local_image: 'first.jpg',
      image_url: 'https://example.com/first.jpg',
      image_thumb: 'https://example.com/first-thumb.jpg',
      image_sexual: 1,
      rating: 80,
      user_rating: 90,
      released: '2020-01-02',
      length_minutes: 120,
      languages: ['ja', 'en'],
      platforms: ['win', 'lin'],
      developers: [{ id: 'p1', name: 'Shared developer' }, { id: '', name: 'Local developer' }],
      tags: [
        { id: 'g1', name: 'Shared tag', rating: 3, spoiler: 0 },
        { id: 'g2', name: 'Hidden spoiler', rating: 2, spoiler: 1 },
        { id: 'g3', name: 'Exclusive tag', rating: 2, spoiler: 0 },
      ],
      staff: [{ ...sharedStaff[0]!, id: 'sx', name: 'Exclusive staff' }, ...sharedStaff],
      va: [{
        note: null,
        character: { id: 'cx', name: 'Exclusive character', original: null },
        staff: { id: 'sx', aid: 99, name: 'Exclusive actor', original: null, lang: null },
      }, ...vaCredits, vaCredits[0]!],
    });
    const second = collectionItem('v2', {
      title: 'Second VN',
      alttitle: 'Second VN',
      image_thumb: 'https://example.com/second-thumb.jpg',
      released: '2021',
      languages: ['ja'],
      platforms: ['win'],
      developers: [{ id: 'p1', name: 'Shared developer' }],
      tags: [{ id: 'g1', name: 'Shared tag', rating: 3, spoiler: 0 }],
      staff: sharedStaff,
    });
    vi.mocked(getCollectionItem).mockImplementation((id) => id === 'v1' ? first : second);
    vi.mocked(findSharedVasForVns).mockReturnValue([
      sharedVa(1, {
        creditsByVn: [{ vn_id: 'v404', characters: [{ c_id: 'cx', c_name: 'Fallback character' }] }],
      }),
      ...Array.from({ length: 8 }, (_unused, index) => sharedVa(index + 2)),
      sharedVa(10, { sid: 'z10' }),
      sharedVa(11, { sid: 'z11' }),
    ]);
    dbMocks.all.mockReturnValue([
      { vn_id: 'v1', c_id: 'c1', c_name: 'Recurring character', va_name: 'Actor one' },
      { vn_id: 'v1', c_id: 'c1', c_name: 'Recurring character', va_name: 'Actor one' },
      { vn_id: 'v2', c_id: 'c1', c_name: 'Recurring character', va_name: 'Actor two' },
      { vn_id: 'v1', c_id: 'c2', c_name: 'Solo character', va_name: 'Actor three' },
    ]);

    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ ids: 'v1,v2' }) }));

    expect(html).toContain('Shared tag');
    expect(html).not.toContain('Hidden spoiler');
    expect(html).toContain('Japanese');
    expect(html).toContain('Shared developer');
    expect(html).toContain('href="/producer/p1"');
    expect(html).toContain('Recurring character');
    expect(html).not.toContain('Solo character');
    expect(html).toContain('Fallback character');
    expect(html).toContain('data-local-src="first.jpg"');
    expect(html).toContain('+1');
    expect(html).toContain('First alternate');
    expect(html).not.toContain('>Second VN</p>');
    expect(html).toContain('9.0');
    expect(html).toContain('data-testid="langs">ja,en');
  });
});
