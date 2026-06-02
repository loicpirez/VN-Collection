import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import TopRankedPage, { generateMetadata } from '@/app/top-ranked/page';
import { fetchVndbTopRankedPage, type VndbTopRanked } from '@/lib/top-ranked';
import { EgsUnreachable, fetchEgsTopRankedPage, type EgsTopRanked } from '@/lib/erogamescape';
import { fetchVnCovers } from '@/lib/vndb';
import { getCacheFreshness } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
}));

vi.mock('@/lib/top-ranked', () => ({
  VNDB_TOP_MIN_VOTES: 50,
  fetchVndbTopRankedPage: vi.fn(),
}));

vi.mock('@/lib/erogamescape', () => {
  class MockEgsUnreachable extends Error {
    constructor(kind: string, detail: string) {
      super(`EGS ${kind}: ${detail}`);
    }
  }
  return {
    EGS_TOP_MIN_VOTES: 10,
    EgsUnreachable: MockEgsUnreachable,
    egsBayesianScore: (median: number, count: number) => (count * median + 30 * 70) / (count + 30),
    fetchEgsTopRankedPage: vi.fn(),
  };
});

vi.mock('@/lib/vndb', () => ({
  fetchVnCovers: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: () => ({ all: dbMocks.all }),
  },
  getCacheFreshness: vi.fn(),
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

vi.mock('@/components/MapEgsToVndbButton', () => ({
  MapEgsToVndbButton: ({ egsId, vndbId }: { egsId: number; vndbId: string | null }) => (
    <button type="button">{`map:${egsId}:${vndbId ?? 'none'}`}</button>
  ),
}));

vi.mock('@/components/RefreshScopeButton', () => ({
  RefreshScopeButton: ({ lastUpdatedAt, scope }: { lastUpdatedAt: number | null; scope: string }) => (
    <button type="button">{`refresh:${scope}:${lastUpdatedAt ?? 'none'}`}</button>
  ),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, sexual, src }: { alt: string; localSrc?: string | null; sexual?: number | null; src?: string | null }) => (
    <img alt={alt} data-local-src={localSrc ?? ''} data-sexual={sexual ?? ''} src={src ?? ''} />
  ),
}));

async function renderPage(searchParams: { tab?: string; page?: string; min?: string } = {}): Promise<string> {
  const stream = await renderToReadableStream(await TopRankedPage({ searchParams: Promise.resolve(searchParams) }));
  await stream.allReady;
  return new Response(stream).text();
}

function vndbRow(id: string, overrides: Partial<VndbTopRanked> = {}): VndbTopRanked {
  return {
    id,
    title: `VNDB ${id}`,
    alttitle: null,
    released: null,
    image: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    languages: [],
    platforms: [],
    developers: [],
    ...overrides,
  };
}

function egsRow(id: number, overrides: Partial<EgsTopRanked> = {}): EgsTopRanked {
  return {
    egs_id: id,
    gamename: `EGS ${id}`,
    furigana: null,
    brand_id: null,
    brand_name: null,
    median: null,
    average: null,
    count: null,
    sellday: null,
    banner_url: null,
    okazu: false,
    erogame: false,
    vndb_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchVndbTopRankedPage).mockReset().mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 50,
    hasMore: false,
  });
  vi.mocked(fetchEgsTopRankedPage).mockReset().mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 50,
    hasMore: false,
  });
  vi.mocked(fetchVnCovers).mockReset().mockResolvedValue(new Map());
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(null);
  dbMocks.all.mockReset().mockReturnValue([]);
});

describe('top-ranked page runtime', () => {
  it('renders metadata and the default VNDB empty state', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.topRanked.title });

    const html = await renderPage();

    expect(html).toContain(dictionaries.en.topRanked.emptyVndb);
    expect(html).toContain('refresh:top-ranked:none');
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /vn:top-ranked:%']);
    expect(fetchVndbTopRankedPage).toHaveBeenCalledWith(1, 50, 50);
  });

  it('renders rich VNDB cards, a dated stale warning, local covers, and deep pagination', async () => {
    vi.mocked(getCacheFreshness).mockReturnValue(12);
    vi.mocked(fetchVndbTopRankedPage).mockResolvedValue({
      rows: [
        vndbRow('v1', {
          title: 'Ranked VN',
          alttitle: 'Ranked alternate',
          released: '2020-01-02',
          image: { url: 'https://example.com/full.jpg', thumbnail: 'https://example.com/thumb.jpg', sexual: 1 },
          rating: 87,
          votecount: 1234,
          developers: [{ id: 'p1', name: 'Developer' }],
        }),
        vndbRow('v2'),
        vndbRow('v3'),
      ],
      page: 3,
      pageSize: 50,
      hasMore: true,
      stale: true,
      fetchedAt: Date.UTC(2025, 0, 2),
    });
    dbMocks.all.mockReturnValue([
      { id: 'v1', local_image: 'local.jpg', local_image_thumb: 'local-thumb.jpg' },
      { id: 'v2', local_image: null, local_image_thumb: 'only-thumb.jpg' },
      { id: 'v3', local_image: null, local_image_thumb: null },
    ]);

    const html = await renderPage({ page: '3', min: '100' });

    expect(html).toContain('Ranked alternate');
    expect(html).toContain('data-local-src="local.jpg"');
    expect(html).toContain('data-local-src="only-thumb.jpg"');
    expect(html).toContain('8.7');
    expect(html).toContain('Developer');
    expect(html).toContain('href="/top-ranked?tab=vndb&amp;page=2&amp;min=100"');
    expect(html).toContain('href="/top-ranked?tab=vndb&amp;page=4&amp;min=100"');
    expect(html).toContain(dictionaries.en.topRanked.staleNoticeTitleVndb);
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /vn:top-ranked:%']);
  });

  it('renders EGS empty state with its hint', async () => {
    const html = await renderPage({ tab: 'egs' });

    expect(html).toContain(dictionaries.en.topRanked.emptyEgs);
    expect(html).toContain(dictionaries.en.topRanked.emptyEgsHint.replaceAll('"', '&quot;'));
    expect(getCacheFreshness).toHaveBeenCalledWith(['egs:top-ranked:%']);
  });

  it('renders mapped and external EGS cards with VNDB, banner, and resolver covers', async () => {
    vi.mocked(fetchEgsTopRankedPage).mockResolvedValue({
      rows: [
        egsRow(1, {
          gamename: 'Mapped EGS',
          furigana: 'Mapped furigana',
          brand_name: 'Mapped brand',
          median: 88,
          count: 100,
          sellday: '2020-01-02',
          banner_url: 'https://example.com/banner.jpg',
          vndb_id: 'v1',
        }),
        egsRow(2, {
          gamename: 'Banner EGS',
          banner_url: 'https://example.com/banner-only.jpg',
          sellday: 'unknown',
          brand_name: ' ',
        }),
        egsRow(3),
        egsRow(4, {
          gamename: 'Mapped without VNDB cover',
          vndb_id: 'v2',
        }),
      ],
      page: 2,
      pageSize: 50,
      hasMore: false,
      stale: true,
    });
    vi.mocked(fetchVnCovers).mockResolvedValue(new Map([
      ['v1', { url: 'https://example.com/vndb.jpg', thumbnail: null, sexual: 2 }],
    ]));

    const html = await renderPage({ tab: 'egs', page: '2' });

    expect(fetchVnCovers).toHaveBeenCalledWith(['v1', 'v2']);
    expect(html).toContain('src="https://example.com/vndb.jpg"');
    expect(html).toContain('src="https://example.com/banner-only.jpg"');
    expect(html).toContain('src="/api/egs-cover/3"');
    expect(html).toContain('href="/vn/v1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('map:3:none');
    expect(html).toContain(dictionaries.en.topRanked.staleNoticeTitle);
    expect(html).toContain('href="/top-ranked?tab=egs"');
  });

  it('renders first-page controls, undated VNDB stale data, and a fresh VNDB feed', async () => {
    vi.mocked(fetchVndbTopRankedPage)
      .mockResolvedValueOnce({
        rows: [vndbRow('v1')],
        page: 1,
        pageSize: 50,
        hasMore: false,
        stale: true,
      })
      .mockResolvedValueOnce({
        rows: [vndbRow('v1')],
        page: 1,
        pageSize: 50,
        hasMore: false,
        stale: false,
      });

    let html = await renderPage();
    expect(html).toContain(dictionaries.en.topRanked.staleNoticeTitleVndb);
    expect(html).toContain(dictionaries.en.topRanked.staleNoticeBody.replace('{when}', '-'));
    expect(html).not.toContain('href="/top-ranked?tab=vndb&amp;page=0"');

    html = await renderPage();
    expect(html).not.toContain(dictionaries.en.topRanked.staleNoticeTitleVndb);
  });

  it('skips VNDB cover lookup for unmapped EGS rows and renders a dated stale warning', async () => {
    vi.mocked(fetchEgsTopRankedPage).mockResolvedValue({
      rows: [egsRow(7)],
      page: 1,
      pageSize: 50,
      hasMore: false,
      stale: true,
      fetchedAt: Date.UTC(2025, 0, 2),
    });

    const html = await renderPage({ tab: 'egs' });

    expect(fetchVnCovers).not.toHaveBeenCalled();
    expect(html).toContain(dictionaries.en.topRanked.staleNoticeTitle);
    expect(html).not.toContain(dictionaries.en.topRanked.staleNoticeBody.replace('{when}', '-'));
  });

  it('renders actionable EGS-unreachable and generic failure states', async () => {
    vi.mocked(fetchEgsTopRankedPage).mockRejectedValueOnce(new EgsUnreachable('network', 'offline'));
    let html = await renderPage({ tab: 'egs' });
    expect(html).toContain(dictionaries.en.topRanked.egsUnreachableTitle);

    vi.mocked(fetchVndbTopRankedPage).mockRejectedValueOnce(new Error('VNDB failed'));
    html = await renderPage();
    expect(html).toContain('VNDB failed');
  });
});
