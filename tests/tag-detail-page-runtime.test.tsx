import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import TagPage, { generateMetadata as generateTagMetadata } from '@/app/tag/[id]/page';
import {
  readCachedTag,
  readCachedTopVnsByTag,
  type CachedTagVnPage,
  type CachedVndbTag,
  type VndbTag,
} from '@/lib/vndb';
import { readVndbTagWebDetailCache, type VndbTagWebCacheResult } from '@/lib/vndb-tag-web-cache';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionCardItem, VndbSearchHit } from '@/lib/types';
import type { VndbTagWebDetail } from '@/lib/vndb-tag-web-parser';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

const collectionRepositoryMocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  listMembershipCounts: vi.fn(),
  readingQueueIds: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db/repositories/collection-list', () => ({
  getCollectionListRepository: () => ({
    listCards: collectionRepositoryMocks.listCards,
    listMembershipCounts: collectionRepositoryMocks.listMembershipCounts,
    readingQueueIds: collectionRepositoryMocks.readingQueueIds,
  }),
}));

vi.mock('@/lib/vndb', () => ({
  readCachedTag: vi.fn(),
  readCachedTopVnsByTag: vi.fn(),
}));

vi.mock('@/lib/vndb-tag-web-cache', () => ({
  readVndbTagWebDetailCache: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src: string | null; alt: string }) => <div data-testid="safe-image">{src ?? 'none'}:{alt}</div>,
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonBlock: ({ className }: { className?: string }) => <div data-testid="skeleton">{className}</div>,
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: Record<string, unknown> }) => <div data-testid="vn-card">{JSON.stringify(data)}</div>,
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

vi.mock('@/components/TagRemoteLoader', () => ({
  TagRemoteLoader: ({ enabled, mode }: { enabled: boolean; mode: string }) => (
    <div data-testid="remote-loader">{String(enabled)}:{mode}</div>
  ),
}));

function tag(overrides: Partial<VndbTag> = {}): VndbTag {
  return {
    id: 'g1',
    name: 'Drama',
    aliases: [],
    description: null,
    category: 'cont',
    searchable: true,
    applicable: true,
    vn_count: 12,
    ...overrides,
  };
}

function detail(overrides: Partial<VndbTagWebDetail> = {}): VndbTagWebDetail {
  return {
    id: 'g1',
    name: 'Drama',
    breadcrumb: [],
    properties: {},
    childGroups: [],
    ...overrides,
  };
}

function cachedTag(value: VndbTag | null = tag(), overrides: Partial<CachedVndbTag> = {}): CachedVndbTag {
  return {
    tag: value,
    fetchedAt: 1,
    expiresAt: 2,
    stale: false,
    ...overrides,
  };
}

function cachedDetail(
  value: VndbTagWebDetail = detail(),
  overrides: Partial<VndbTagWebCacheResult<VndbTagWebDetail>> = {},
): VndbTagWebCacheResult<VndbTagWebDetail> {
  return {
    data: value,
    fetched_at: 1,
    stale: false,
    source_url: 'https://vndb.org/g1',
    ...overrides,
  };
}

function cachedVns(
  results: CachedTagVnPage['results'] = [],
  overrides: Partial<CachedTagVnPage> = {},
): CachedTagVnPage {
  return {
    results,
    more: false,
    fetchedAt: 1,
    expiresAt: 2,
    stale: false,
    ...overrides,
  };
}

function hit(id: string, overrides: Partial<Omit<VndbSearchHit, 'in_collection'>> = {}): Omit<VndbSearchHit, 'in_collection'> {
  return {
    id,
    title: `Hit ${id}`,
    alttitle: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    languages: [],
    platforms: [],
    image: null,
    developers: [],
    ...overrides,
  };
}

function card(id: string): CollectionCardItem {
  return {
    id,
    title: `Card ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    released: null,
    length_minutes: null,
    rating: null,
    developers: [],
    publishers: [],
    tags: [],
    relations: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    fetched_at: 1,
  };
}

async function renderTag(params: { id: string }, searchParams: Record<string, string | string[] | undefined>): Promise<string> {
  const stream = await renderToReadableStream(await TagPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  }));
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  collectionRepositoryMocks.listCards.mockReset().mockResolvedValue([]);
  collectionRepositoryMocks.listMembershipCounts.mockReset().mockResolvedValue(new Map());
  collectionRepositoryMocks.readingQueueIds.mockReset().mockResolvedValue(new Set());
  vi.mocked(readCachedTag).mockReset().mockResolvedValue(cachedTag());
  vi.mocked(readCachedTopVnsByTag).mockReset().mockResolvedValue(cachedVns());
  vi.mocked(readVndbTagWebDetailCache).mockReset().mockResolvedValue(cachedDetail());
});

describe('tag detail page runtime', () => {
  it('renders resolved and fallback metadata', async () => {
    expect(await generateTagMetadata({ params: Promise.resolve({ id: 'G1' }) })).toEqual({
      title: `Drama - ${dictionaries.en.nav.tags}`,
    });
    expect(readCachedTag).toHaveBeenCalledWith('g1');

    vi.mocked(readCachedTag).mockResolvedValueOnce(null);
    expect(await generateTagMetadata({ params: Promise.resolve({ id: 'G2' }) })).toEqual({
      title: `G2 - ${dictionaries.en.nav.tags}`,
    });
  });

  it('rejects malformed ids', async () => {
    await expect(TagPage({
      params: Promise.resolve({ id: 'bad' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('not-found');
  });

  it('renders the local empty state and external escape hatch', async () => {
    vi.mocked(readCachedTag).mockResolvedValueOnce(cachedTag(null));

    const html = await renderTag({ id: 'G1' }, {});

    expect(html).toContain(dictionaries.en.tagPage.localEmpty);
    expect(html).toContain(dictionaries.en.tagPage.emptyHint);
    expect(html).toContain('href="https://vndb.org/g1"');
    expect(html).toContain('>g1</h1>');
  });

  it('falls back to the tag id and starts hydration on a cache miss', async () => {
    vi.mocked(readCachedTag).mockResolvedValueOnce(null);

    const html = await renderTag({ id: 'g1' }, {});

    expect(html).toContain('>g1</h1>');
    expect(html).toContain('true<!-- -->:<!-- -->local');
  });

  it('renders enriched local cards, the library action, and the local cap warning', async () => {
    collectionRepositoryMocks.listCards.mockResolvedValue(Array.from({ length: 500 }, (_, index) => card(`v${index + 1}`)));
    collectionRepositoryMocks.listMembershipCounts.mockResolvedValue(new Map([['v1', 3]]));
    collectionRepositoryMocks.readingQueueIds.mockResolvedValue(new Set(['v1']));

    const html = await renderTag({ id: 'g1' }, { tab: 'local' });

    expect(html).toContain(dictionaries.en.tagPage.localLimitNotice);
    expect(html).toContain('href="/?tag=g1"');
    expect(html).toContain('&quot;listCount&quot;:3');
    expect(html).toContain('&quot;inReadingQueue&quot;:true');
  });

  it('renders VNDB hierarchy, child chips, top cards, and both pagination links', async () => {
    vi.mocked(readCachedTag).mockResolvedValue(cachedTag(tag({
      aliases: ['Alias'],
      description: 'Description',
      category: 'ero',
      searchable: false,
      applicable: false,
    })));
    vi.mocked(readVndbTagWebDetailCache).mockResolvedValueOnce(cachedDetail(
      detail({
        breadcrumb: [
          { id: 'g2', name: 'Parent', href: '/tag/g2?tab=vndb' },
          { id: null, name: 'Self', href: null },
        ],
        categoryLabel: 'Content',
        properties: { searchable: false, applicable: true },
        childGroups: [{
          title: 'Children',
          children: [
            { id: 'g3', name: 'Child counted', href: '/tag/g3?tab=vndb', count: 4 },
            { id: 'g4', name: 'Child plain', href: '/tag/g4?tab=vndb' },
          ],
        }],
      }),
      { stale: true, warning: 'stale hierarchy' },
    ));
    vi.mocked(readCachedTopVnsByTag).mockResolvedValueOnce(cachedVns([
        hit('v1', { image: { thumbnail: 'thumb.jpg', url: 'full.jpg' }, rating: 85, released: '2026-01-02' }),
        hit('v2', { image: { thumbnail: '', url: 'fallback.jpg' } }),
      ], { more: true }));

    const html = await renderTag({ id: 'g1' }, { tab: 'vndb', page: '2' });

    expect(html).toContain('Alias');
    expect(html).toContain('Description');
    expect(html).toContain('stale hierarchy');
    expect(html).toContain('href="/tag/g2?tab=vndb"');
    expect(html).toContain('Child counted');
    expect(html).toContain('(<!-- -->4<!-- -->)');
    expect(html).toContain('thumb.jpg<!-- -->:<!-- -->Hit v1');
    expect(html).toContain('fallback.jpg<!-- -->:<!-- -->Hit v2');
    expect(html).toContain('href="/tag/g1?tab=vndb"');
    expect(html).toContain('href="/tag/g1?tab=vndb&amp;page=3"');
  });

  it('renders skeletons and starts client hydration when VNDB snapshots are absent', async () => {
    vi.mocked(readVndbTagWebDetailCache).mockResolvedValueOnce(null);
    vi.mocked(readCachedTopVnsByTag).mockResolvedValueOnce(null);

    const html = await renderTag({ id: 'g1' }, { tab: 'vndb' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('true<!-- -->:<!-- -->vndb');
  });

  it('renders a resolved empty VNDB result after cache hydration', async () => {
    const html = await renderTag({ id: 'g1' }, { tab: 'vndb' });
    expect(html).toContain(dictionaries.en.search.noResults);
    expect(html).toContain('false<!-- -->:<!-- -->vndb');
  });

  it('renders previous-only VNDB pagination and image/rating fallbacks', async () => {
    vi.mocked(readCachedTopVnsByTag).mockResolvedValueOnce(cachedVns([
        hit('v3', { released: null, rating: null, image: null }),
      ]));

    const html = await renderTag({ id: 'g1' }, { tab: 'vndb', page: '2' });

    expect(html).toContain('none<!-- -->:<!-- -->Hit v3');
    expect(html).toContain('href="/tag/g1?tab=vndb"');
    expect(html).not.toContain('href="/tag/g1?tab=vndb&amp;page=3"');
    expect(html).not.toContain('fill-accent');
  });

  it('renders true searchable and false applicable hierarchy chips on first-page VNDB results', async () => {
    vi.mocked(readVndbTagWebDetailCache).mockResolvedValueOnce(cachedDetail(
      detail({
        properties: { searchable: true, applicable: false },
      }),
    ));
    vi.mocked(readCachedTopVnsByTag).mockResolvedValueOnce(cachedVns([
      hit('v4', { rating: 70, released: '2025-05-01' }),
    ]));

    const html = await renderTag({ id: 'g1' }, { tab: 'vndb' });

    expect(html).toContain(dictionaries.en.tagPage.searchable);
    expect(html).toContain(dictionaries.en.tagPage.notApplicable);
    expect(html).toContain('7.0');
    expect(html).toContain('2025');
    expect(html).toContain(dictionaries.en.tagPage.pageLabel.replace('{n}', '1'));
  });
});
