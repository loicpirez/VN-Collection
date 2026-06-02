import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import TagPage, { generateMetadata as generateTagMetadata } from '@/app/tag/[id]/page';
import { countListMembershipsByVn, getReadingQueueVnIds, listCollectionForCards } from '@/lib/db';
import { fetchTopVnsByTag, getTag, type VndbTag } from '@/lib/vndb';
import { getVndbTagWebDetail } from '@/lib/vndb-tag-web-cache';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionCardItem, VndbSearchHit } from '@/lib/types';
import type { VndbTagWebDetail } from '@/lib/vndb-tag-web-parser';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db', () => ({
  countListMembershipsByVn: vi.fn(),
  getReadingQueueVnIds: vi.fn(),
  listCollectionForCards: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  fetchTopVnsByTag: vi.fn(),
  getTag: vi.fn(),
}));

vi.mock('@/lib/vndb-tag-web-cache', () => ({
  getVndbTagWebDetail: vi.fn(),
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
  vi.mocked(countListMembershipsByVn).mockReset().mockReturnValue(new Map());
  vi.mocked(getReadingQueueVnIds).mockReset().mockReturnValue(new Set());
  vi.mocked(listCollectionForCards).mockReset().mockReturnValue([]);
  vi.mocked(getTag).mockReset().mockResolvedValue(tag());
  vi.mocked(fetchTopVnsByTag).mockReset().mockResolvedValue({ results: [], more: false });
  vi.mocked(getVndbTagWebDetail).mockReset().mockResolvedValue({
    data: detail(),
    fetched_at: 1,
    stale: false,
    source_url: 'https://vndb.org/g1',
  });
});

describe('tag detail page runtime', () => {
  it('renders resolved and fallback metadata', async () => {
    expect(await generateTagMetadata({ params: Promise.resolve({ id: 'G1' }) })).toEqual({
      title: `Drama - ${dictionaries.en.nav.tags}`,
    });
    expect(getTag).toHaveBeenCalledWith('g1');

    vi.mocked(getTag).mockRejectedValueOnce(new Error('offline'));
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
    vi.mocked(getTag).mockResolvedValueOnce(null);

    const html = await renderTag({ id: 'G1' }, {});

    expect(html).toContain(dictionaries.en.tagPage.localEmpty);
    expect(html).toContain(dictionaries.en.tagPage.emptyHint);
    expect(html).toContain('href="https://vndb.org/g1"');
    expect(html).toContain('>g1</h1>');
  });

  it('renders enriched local cards, the library action, and the local cap warning', async () => {
    vi.mocked(listCollectionForCards).mockReturnValue(Array.from({ length: 500 }, (_, index) => card(`v${index + 1}`)));
    vi.mocked(countListMembershipsByVn).mockReturnValue(new Map([['v1', 3]]));
    vi.mocked(getReadingQueueVnIds).mockReturnValue(new Set(['v1']));

    const html = await renderTag({ id: 'g1' }, { tab: 'local' });

    expect(html).toContain(dictionaries.en.tagPage.localLimitNotice);
    expect(html).toContain('href="/?tag=g1"');
    expect(html).toContain('&quot;listCount&quot;:3');
    expect(html).toContain('&quot;inReadingQueue&quot;:true');
  });

  it('renders VNDB hierarchy, child chips, top cards, and both pagination links', async () => {
    vi.mocked(getTag).mockResolvedValue(tag({
      aliases: ['Alias'],
      description: 'Description',
      category: 'ero',
      searchable: false,
      applicable: false,
    }));
    vi.mocked(getVndbTagWebDetail).mockResolvedValueOnce({
      data: detail({
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
      fetched_at: 1,
      stale: true,
      source_url: 'https://vndb.org/g1',
      warning: 'stale hierarchy',
    });
    vi.mocked(fetchTopVnsByTag).mockResolvedValueOnce({
      results: [
        hit('v1', { image: { thumbnail: 'thumb.jpg', url: 'full.jpg' }, rating: 85, released: '2026-01-02' }),
        hit('v2', { image: { thumbnail: '', url: 'fallback.jpg' } }),
      ],
      more: true,
    });

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

  it('renders hierarchy and VNDB-result upstream errors and empty VNDB results', async () => {
    vi.mocked(getVndbTagWebDetail).mockRejectedValueOnce(new Error('hierarchy offline'));
    vi.mocked(fetchTopVnsByTag).mockRejectedValueOnce(new Error('results offline'));

    let html = await renderTag({ id: 'g1' }, { tab: 'vndb' });
    expect(html).toContain('hierarchy offline');
    expect(html).toContain('results offline');

    html = await renderTag({ id: 'g1' }, { tab: 'vndb' });
    expect(html).toContain(dictionaries.en.search.noResults);
  });
});
