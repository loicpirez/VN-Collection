import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import UpcomingPage, { generateMetadata } from '@/app/upcoming/page';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection, type UpcomingRelease } from '@/lib/upcoming';
import { EgsUnreachable, fetchEgsAnticipatedPage, type EgsAnticipated } from '@/lib/erogamescape';
import { fetchVnCovers } from '@/lib/vndb';
import { getCacheFreshness } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
}));

vi.mock('@/lib/upcoming', () => ({
  fetchAllUpcomingFromVndb: vi.fn(),
  fetchUpcomingForCollection: vi.fn(),
}));

vi.mock('@/lib/erogamescape', () => {
  class MockEgsUnreachable extends Error {
    constructor(kind: string, detail: string) {
      super(`EGS ${kind}: ${detail}`);
    }
  }
  return {
    EgsUnreachable: MockEgsUnreachable,
    fetchEgsAnticipatedPage: vi.fn(),
  };
});

vi.mock('@/lib/vndb', () => ({
  fetchVnCovers: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: (sql: string) => ({
      all: (...params: string[]) => dbMocks.all(sql, ...params),
    }),
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

vi.mock('@/components/RefreshScopeButton', () => ({
  RefreshScopeButton: ({ lastUpdatedAt, scope }: { lastUpdatedAt: number | null; scope: string }) => (
    <button type="button">{`refresh:${scope}:${lastUpdatedAt ?? 'none'}`}</button>
  ),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonRows: ({ count }: { count: number }) => <div>{`skeleton:${count}`}</div>,
}));

vi.mock('@/components/UpcomingCard', () => ({
  UpcomingCard: ({ data, meta }: { data: Record<string, unknown>; meta?: React.ReactNode }) => (
    <article data-card={JSON.stringify(data)}>{meta}</article>
  ),
}));

async function renderPage(searchParams: { tab?: string; page?: string } = {}): Promise<string> {
  const stream = await renderToReadableStream(await UpcomingPage({ searchParams: Promise.resolve(searchParams) }));
  await stream.allReady;
  return new Response(stream).text();
}

function release(id: string, overrides: Partial<UpcomingRelease> = {}): UpcomingRelease {
  return {
    id,
    title: `Release ${id}`,
    alttitle: null,
    released: '2099-01-01',
    languages: [],
    platforms: [],
    producers: [],
    vns: [],
    patch: false,
    freeware: false,
    has_ero: false,
    ...overrides,
  };
}

function anticipated(id: number, overrides: Partial<EgsAnticipated> = {}): EgsAnticipated {
  return {
    egs_id: id,
    gamename: `EGS ${id}`,
    brand_name: null,
    sellday: '2099-01-01',
    vndb_id: null,
    will_buy: 3,
    probably_buy: 2,
    watching: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchUpcomingForCollection).mockReset().mockResolvedValue([]);
  vi.mocked(fetchAllUpcomingFromVndb).mockReset().mockResolvedValue([]);
  vi.mocked(fetchEgsAnticipatedPage).mockReset().mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 50,
    hasMore: false,
  });
  vi.mocked(fetchVnCovers).mockReset().mockResolvedValue(new Map());
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(null);
  dbMocks.all.mockReset().mockReturnValue([]);
});

describe('upcoming page runtime', () => {
  it('renders metadata and the default collection empty state', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.nav.upcoming });

    const html = await renderPage();

    expect(html).toContain(dictionaries.en.upcoming.empty);
    expect(html).toContain('refresh:upcoming-collection:none');
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /release|%', '% /release:%']);
    expect(fetchUpcomingForCollection).toHaveBeenCalledOnce();
  });

  it('renders the all-tab empty state and uses its refresh scope', async () => {
    const html = await renderPage({ tab: 'all' });

    expect(html).toContain(dictionaries.en.upcoming.emptyAll);
    expect(html).toContain('refresh:upcoming-all:none');
    expect(fetchAllUpcomingFromVndb).toHaveBeenCalledWith(200);
  });

  it('renders grouped release cards with local overlays, metadata, and TBA localization', async () => {
    vi.mocked(fetchUpcomingForCollection).mockResolvedValue([
      release('r1', {
        title: 'Remote cover',
        producers: [
          { id: '', name: 'Ignored' },
          { id: 'p1', name: 'Producer One' },
          { id: 'p2', name: 'Producer Two' },
          { id: 'p3', name: 'Producer Three' },
          { id: 'p4', name: 'Producer Four' },
        ],
        vns: [{ id: 'v1', title: 'VN 1', image: { url: 'rel-full.jpg', thumbnail: 'rel-thumb.jpg', sexual: 2 } }],
        patch: true,
        freeware: true,
        has_ero: true,
      }),
      release('r2', {
        title: 'Thumbnail cover',
        released: '2099-01-20',
        vns: [{ id: 'v2', title: 'VN 2', image: { url: '', thumbnail: 'rel-thumb-only.jpg' } }],
      }),
      release('r3', {
        title: 'Local cover',
        released: '2099-02',
        vns: [{ id: 'v3', title: 'VN 3', image: null }],
      }),
      release('r4', {
        title: 'No linked VN',
        released: '2099',
      }),
      release('r5', {
        title: 'Synthetic VN',
        released: 'unknown',
        vns: [{ id: 'egs_5', title: 'Synthetic', image: null }],
      }),
      release('r6', {
        title: 'No cover',
        released: 'TBA',
        vns: [{ id: 'v4', title: 'VN 4', image: null }],
      }),
    ]);
    dbMocks.all.mockImplementation((sql: string) => {
      if (sql.includes('FROM vn WHERE id IN')) {
        return [
          { id: 'v1', image_url: 'db-v1.jpg', image_thumb: null, image_sexual: 0, local_image: 'local-v1.jpg', local_image_thumb: null },
          { id: 'v2', image_url: null, image_thumb: null, image_sexual: 1, local_image: null, local_image_thumb: null },
          { id: 'v3', image_url: '', image_thumb: 'db-v3-thumb.jpg', image_sexual: 1, local_image: '', local_image_thumb: 'local-v3-thumb.jpg' },
          { id: 'v4', image_url: null, image_thumb: null, image_sexual: null, local_image: null, local_image_thumb: null },
        ];
      }
      if (sql.includes('FROM collection')) return [{ vn_id: 'v1' }];
      return [];
    });

    const html = await renderPage();

    expect(html).toContain('Remote cover');
    expect(html).toContain('Producer One');
    expect(html).toContain('Producer Three');
    expect(html).not.toContain('Producer Four');
    expect(html).toContain(dictionaries.en.releases.patch);
    expect(html).toContain(dictionaries.en.releases.freeware);
    expect(html).toContain(dictionaries.en.releases.hasEro);
    expect(html).toContain(dictionaries.en.upcoming.bucketTba);
    expect(html).toContain('&quot;coverUrl&quot;:&quot;rel-full.jpg&quot;');
    expect(html).toContain('&quot;coverUrl&quot;:&quot;rel-thumb-only.jpg&quot;');
    expect(html).toContain('&quot;coverUrl&quot;:&quot;db-v3-thumb.jpg&quot;');
    expect(html).toContain('&quot;coverLocal&quot;:&quot;local-v3-thumb.jpg&quot;');
    expect(html).toContain('&quot;inCollection&quot;:true');
  });

  it('chunks local cover and collection lookups above the SQLite variable budget', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => release(`r${i}`, {
      vns: [{ id: `v${i + 1}`, title: `VN ${i + 1}`, image: null }],
    }));
    vi.mocked(fetchUpcomingForCollection).mockResolvedValue(rows);

    await renderPage();

    const sqlCalls = dbMocks.all.mock.calls.map(([sql]) => sql as string);
    expect(sqlCalls.filter((sql) => sql.includes('FROM vn WHERE id IN'))).toHaveLength(2);
    expect(sqlCalls.filter((sql) => sql.includes('FROM collection'))).toHaveLength(2);
  });

  it('renders release rows without VNDB-shaped ids without querying local cover tables', async () => {
    vi.mocked(fetchUpcomingForCollection).mockResolvedValue([
      release('r1'),
      release('r2', {
        vns: [{ id: 'egs_2', title: 'Synthetic VN', image: null }],
      }),
    ]);

    const html = await renderPage();

    expect(html).toContain('Release r1');
    expect(html).toContain('Release r2');
    expect(dbMocks.all).not.toHaveBeenCalled();
  });

  it('renders EGS anticipated cards, mapped covers, local membership, stale date, and deep pagination', async () => {
    vi.mocked(getCacheFreshness).mockReturnValue(12);
    vi.mocked(fetchEgsAnticipatedPage).mockResolvedValue({
      rows: [
        anticipated(1, { gamename: 'Mapped EGS', brand_name: 'Brand Name', vndb_id: 'v1' }),
        anticipated(2, { gamename: 'Mapped without cover', brand_name: ' ', sellday: 'unknown', vndb_id: 'v2' }),
        anticipated(3, { gamename: 'Unmapped EGS', brand_name: null, sellday: 'TBA' }),
      ],
      page: 2,
      pageSize: 50,
      hasMore: true,
      stale: true,
      fetchedAt: Date.UTC(2025, 0, 2),
    });
    vi.mocked(fetchVnCovers).mockResolvedValue(new Map([
      ['v1', { url: 'https://example.com/vndb.jpg', thumbnail: null, sexual: 2 }],
    ]));
    dbMocks.all.mockImplementation((sql: string) => sql.includes('FROM collection') ? [{ vn_id: 'v1' }] : []);

    const html = await renderPage({ tab: 'anticipated', page: '2' });

    expect(fetchEgsAnticipatedPage).toHaveBeenCalledWith(2, 50);
    expect(fetchVnCovers).toHaveBeenCalledWith(['v1', 'v2']);
    expect(getCacheFreshness).toHaveBeenCalledWith(['egs:anticipated:%']);
    expect(html).toContain('refresh:upcoming-anticipated:12');
    expect(html).toContain('&quot;coverUrl&quot;:&quot;https://example.com/vndb.jpg&quot;');
    expect(html).toContain('&quot;coverUrl&quot;:&quot;/api/egs-cover/2&quot;');
    expect(html).toContain('&quot;id&quot;:&quot;egs_3&quot;');
    expect(html).toContain('href="/?yearMin=2099&amp;yearMax=2099"');
    expect(html).toContain('href="/search?q=Brand%20Name"');
    expect(html).toContain('href="/upcoming?tab=anticipated"');
    expect(html).toContain('href="/upcoming?tab=anticipated&amp;page=3"');
    expect(html).toContain(dictionaries.en.upcoming.staleNoticeTitle);
  });

  it('renders anticipated empty rows, first-page controls, and an undated stale warning', async () => {
    let html = await renderPage({ tab: 'anticipated', page: 'invalid' });
    expect(html).toContain(dictionaries.en.upcoming.emptyAnticipated);
    expect(fetchVnCovers).toHaveBeenCalledWith([]);

    vi.mocked(fetchEgsAnticipatedPage).mockResolvedValue({
      rows: [anticipated(1)],
      page: 1,
      pageSize: 50,
      hasMore: false,
      stale: true,
    });
    html = await renderPage({ tab: 'anticipated', page: '0' });
    expect(html).toContain(dictionaries.en.upcoming.staleNoticeBody.replace('{when}', '-'));
    expect(html).not.toContain('href="/upcoming?tab=anticipated&amp;page=0"');
  });

  it('clamps anticipated pages and renders actionable and generic failures', async () => {
    await renderPage({ tab: 'anticipated', page: '999' });
    expect(fetchEgsAnticipatedPage).toHaveBeenCalledWith(20, 50);

    vi.mocked(fetchEgsAnticipatedPage).mockRejectedValueOnce(new EgsUnreachable('network', 'offline'));
    let html = await renderPage({ tab: 'anticipated' });
    expect(html).toContain(dictionaries.en.upcoming.egsUnreachableTitle);

    vi.mocked(fetchUpcomingForCollection).mockRejectedValueOnce(new Error('VNDB failed'));
    html = await renderPage();
    expect(html).toContain('VNDB failed');
  });
});
