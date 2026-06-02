import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import RecommendationsPage, { generateMetadata } from '@/app/recommendations/page';
import { recommendVns, type Recommendation, type RecommendationSeed, type RecommendMode, type SignalCounts } from '@/lib/recommend';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@/lib/recommend', () => {
  const modes = ['because-you-liked', 'tag-based', 'hidden-gems', 'highly-rated', 'similar-to-vn'] as const;
  return {
    DEFAULT_RECOMMEND_MODE: 'because-you-liked',
    RECOMMEND_MODES: modes,
    parseRecommendMode: (raw: string | null | undefined) => {
      const normalized = (raw ?? '').toLowerCase();
      return modes.includes(normalized as typeof modes[number]) ? normalized : 'because-you-liked';
    },
    recommendVns: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    prepare: (sql: string) => ({
      all: (...params: string[]) => dbMocks.all(sql, ...params),
      get: (...params: string[]) => dbMocks.get(sql, ...params),
    }),
  },
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div>{`density:${scope}`}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/RecommendModeTabs', () => ({
  RecommendModeTabs: ({ ariaLabel, tabs }: { ariaLabel: string; tabs: Array<{ id: string; href: string; active: boolean }> }) => (
    <nav aria-label={ariaLabel}>
      {tabs.map((tab) => <span key={tab.id}>{`${tab.id}:${tab.href}:${tab.active}`}</span>)}
    </nav>
  ),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, sexual, src }: { alt: string; sexual?: number | null; src?: string | null }) => (
    <img alt={alt} data-sexual={sexual ?? ''} {...(src ? { src } : {})} />
  ),
}));

vi.mock('@/components/SeedTagControls', () => ({
  SeedTagControls: ({ hint, initial, preserveParams }: { hint: string; initial: unknown[]; preserveParams: string[] }) => (
    <div data-hint={hint} data-initial={JSON.stringify(initial)} data-preserve={preserveParams.join(',')} />
  ),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonCardGrid: ({ count }: { count: number }) => <div>{`skeleton:${count}`}</div>,
}));

vi.mock('@/components/VnSeedPicker', () => ({
  VnSeedPicker: ({ initialSeed }: { initialSeed: { id: string } }) => <div>{`picker:${initialSeed.id}`}</div>,
}));

vi.mock('@/components/SimilarSeedEmptyState', () => ({
  SimilarSeedEmptyState: ({ fallbackSeedId, invalid }: { fallbackSeedId?: string; invalid: boolean }) => (
    <div>{`similar-empty:${invalid}:${fallbackSeedId ?? 'none'}`}</div>
  ),
}));

interface RecommendFixture {
  seeds: RecommendationSeed[];
  results: Recommendation[];
  mode: RecommendMode;
  rawSeeds?: RecommendationSeed[];
  signalCounts?: SignalCounts;
}

async function renderPage(searchParams: {
  ero?: string;
  tags?: string;
  mode?: string;
  seed?: string;
  owned?: string;
  wishlist?: string;
} = {}): Promise<string> {
  const stream = await renderToReadableStream(await RecommendationsPage({ searchParams: Promise.resolve(searchParams) }));
  await stream.allReady;
  return new Response(stream).text();
}

function seed(tagId: string, name = `Tag ${tagId}`, weight = 1): RecommendationSeed {
  return { tagId, name, weight };
}

function result(id: string, overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id,
    title: `Recommendation ${id}`,
    alttitle: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    image: null,
    developers: [],
    score: 1,
    matchedTags: [],
    ...overrides,
  };
}

function fixture(overrides: Partial<RecommendFixture> = {}): RecommendFixture {
  return {
    seeds: [],
    results: [],
    mode: 'because-you-liked',
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.all.mockReset().mockReturnValue([]);
  dbMocks.get.mockReset().mockReturnValue(undefined);
  vi.mocked(recommendVns).mockReset().mockResolvedValue(fixture());
});

describe('recommendations page runtime', () => {
  it('renders metadata, default controls, and the no-seed empty state', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.nav.recommend });

    const html = await renderPage();

    expect(html).toContain(dictionaries.en.recommend.empty);
    expect(html).toContain('density:recommendations');
    expect(html).toContain('because-you-liked:/recommendations:true');
    expect(html).toContain('tag-based:/recommendations?mode=tag-based:false');
    expect(html).toContain(dictionaries.en.recommend.eroExcluded);
    expect(dictionaries.en.recommend.ownedExcluded).not.toBe('');
    expect(html).toContain(dictionaries.en.recommend.ownedExcluded);
    expect(html).toContain(dictionaries.en.recommend.wishlistExcluded);
    expect(recommendVns).toHaveBeenCalledWith(expect.objectContaining({ resultLimit: 0 }));
    expect(recommendVns).toHaveBeenCalledWith(expect.not.objectContaining({ resultLimit: 0 }));
  });

  it('renders rich auto-derived recommendations with explanation, badges, and contributor variants', async () => {
    const seeds = [seed('g1', 'After one', 1.25), seed('g2', 'After two', 0.75)];
    const rawSeeds = [seed('g3', 'Demoted raw', 3), seed('g1', 'After one', 1.25)];
    dbMocks.all.mockImplementation((sql: string) => sql.includes('SELECT v.id, v.title')
      ? [
          { id: 'v1', title: 'Rated One' },
          { id: 'v2', title: 'Rated Two' },
          { id: 'v3', title: 'Rated Three' },
        ]
      : []);
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => {
      if (options?.resultLimit === 0) return fixture({ seeds, mode: 'hidden-gems' });
      return fixture({
        seeds,
        rawSeeds,
        signalCounts: { finished: 2, rated: 3, favorite: 1, queue: 1, wishlist: 1, total: 4 },
        mode: 'hidden-gems',
        results: [
          result('v10', {
            title: 'Rich result',
            released: '2020-01-02',
            rating: 87,
            votecount: 42,
            image: { url: 'full.jpg', thumbnail: 'thumb.jpg', sexual: 2 },
            developers: [{ name: 'Studio' }],
            matchedTags: [
              { id: 'g1', name: 'One' },
              { id: 'g1', name: 'Duplicate one' },
              { id: 'g2', name: 'Two' },
              { id: 'g3', name: 'Three' },
              { id: 'g4', name: 'Four' },
              { id: 'g5', name: 'Five' },
            ],
            inCollection: true,
            inWishlist: true,
            contributors: [{ id: 'v1', title: 'Rated One' }, { id: 'v2', title: 'Rated Two' }],
          }),
          result('v11', {
            contributors: [{ id: 'v3', title: 'Rated Three' }],
          }),
          result('v12'),
        ],
      });
    });

    const html = await renderPage({ mode: 'hidden-gems', ero: '1', owned: '1', wishlist: '1' });

    expect(html).toContain('Rated One');
    expect(html).toContain(` ${dictionaries.en.recommend.whyAnd} `);
    expect(html).toContain('Demoted raw');
    expect(html).toContain('After one');
    expect(html).toContain(dictionaries.en.recommend.explain.filterOwnedOn);
    expect(html).toContain(dictionaries.en.recommend.explain.filterWishlistOn);
    expect(html).toContain(dictionaries.en.recommend.explain.filterEroOn);
    expect(html).toContain(dictionaries.en.recommend.badgeInCollection);
    expect(html).toContain(dictionaries.en.recommend.badgeOnWishlist);
    expect(html).toContain('src="thumb.jpg"');
    expect(html).toContain('Studio');
    expect(html).toContain('+<!-- -->1');
    expect(html).toContain('href="/recommendations?mode=hidden-gems&amp;owned=1&amp;wishlist=1"');
  });

  it('renders tag-based custom seeds, filters invalid ids, and preserves URL flags', async () => {
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      mode: 'tag-based',
      results: options?.resultLimit === 0
        ? []
        : [result('v20', { matchedTags: [{ id: 'g1', name: 'One' }] }), result('v21')],
    }));

    const html = await renderPage({ mode: 'tag-based', tags: ' G1, bad, g2 ', ero: '1' });

    expect(recommendVns).toHaveBeenCalledWith(expect.objectContaining({ customTagIds: ['g1', 'g2'] }));
    expect(html).toContain(dictionaries.en.recommend.seedsHintCustom);
    expect(html).toContain('data-preserve="ero,owned,wishlist,mode"');
    expect(html).toContain(dictionaries.en.recommend.cardReason.tagBased.replace('{n}', '1'));
    expect(html).toContain('href="/recommendations?mode=tag-based&amp;tags=+G1%2C+bad%2C+g2+&amp;ero=1&amp;owned=1"');
  });

  it('renders similar-mode picker states and resolves a local seed chip', async () => {
    let html = await renderPage({ mode: 'similar-to-vn' });
    expect(html).toContain('similar-empty:false:none');
    expect(html).toContain(dictionaries.en.recommend.modes.similarToVn.needsSeed);

    html = await renderPage({ mode: 'similar-to-vn', seed: 'v404' });
    expect(html).toContain('similar-empty:true:v404');

    dbMocks.get.mockReturnValue({
      id: 'v1',
      title: 'Seed VN',
      alttitle: 'Seed alternate',
      released: '2020-01-02',
      image_url: null,
      image_thumb: 'seed-thumb.jpg',
      image_sexual: 1,
      developers: JSON.stringify([{ id: 'p1', name: 'Seed Developer' }]),
    });
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      mode: 'similar-to-vn',
      results: options?.resultLimit === 0 ? [] : [result('v2', { matchedTags: [{ id: 'g1', name: 'One' }] })],
    }));

    html = await renderPage({ mode: 'similar-to-vn', seed: 'V1' });
    expect(html).toContain('picker:v1');
    expect(html).toContain('data-preserve="ero,owned,wishlist,mode,seed"');
    expect(html).toContain(dictionaries.en.recommend.cardReason.similarToVn.replace('{n}', '1'));
  });

  it('treats missing-title local seeds and syntactically invalid seed ids as empty picker states', async () => {
    dbMocks.get.mockReturnValue({
      id: 'v1',
      title: null,
      alttitle: null,
      released: null,
      image_url: null,
      image_thumb: null,
      image_sexual: null,
      developers: null,
    });
    let html = await renderPage({ mode: 'similar-to-vn', seed: 'v1' });
    expect(html).toContain('similar-empty:true:v1');

    html = await renderPage({ mode: 'similar-to-vn', seed: 'not-an-id' });
    expect(html).toContain('similar-empty:false:none');
  });

  it('renders the result error and seeded-but-empty states while seed-tag lookup fails independently', async () => {
    vi.mocked(recommendVns)
      .mockRejectedValueOnce(new Error('seed lookup failed'))
      .mockRejectedValueOnce(new Error('result lookup failed'));

    let html = await renderPage();
    expect(html).toContain('result lookup failed');

    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      results: options?.resultLimit === 0 ? [] : [],
    }));
    html = await renderPage();
    expect(html).toContain(dictionaries.en.recommend.empty);
  });

  it('renders rating fallbacks and reason branches for because-liked and highly-rated modes', async () => {
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      mode: 'because-you-liked',
      results: options?.resultLimit === 0
        ? []
        : [
            result('v1', { matchedTags: [{ id: 'g1', name: 'One' }] }),
            result('v2'),
          ],
    }));
    let html = await renderPage();
    expect(html).toContain(dictionaries.en.recommend.cardReason.becauseYouLiked.replace('{n}', '1'));

    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      mode: 'highly-rated',
      results: options?.resultLimit === 0 ? [] : [result('v3')],
    }));
    html = await renderPage({ mode: 'highly-rated' });
    expect(html).toContain(dictionaries.en.recommend.cardReason.highlyRated.replace('{votes}', '-').replace('{rating}', '-'));
  });

  it('renders seed chips with URL-only and absent images plus explanation off-state filters', async () => {
    dbMocks.get
      .mockReturnValueOnce({
        id: 'v1',
        title: 'URL-only seed',
        alttitle: null,
        released: null,
        image_url: 'seed-full.jpg',
        image_thumb: null,
        image_sexual: null,
        developers: null,
      })
      .mockReturnValueOnce({
        id: 'v2',
        title: 'No-image seed',
        alttitle: null,
        released: null,
        image_url: null,
        image_thumb: null,
        image_sexual: null,
        developers: null,
      });
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      signalCounts: options?.resultLimit === 0
        ? undefined
        : { finished: 1, rated: 0, favorite: 0, queue: 0, wishlist: 0, total: 1 },
      mode: 'similar-to-vn',
      results: options?.resultLimit === 0 ? [] : [result('v3')],
    }));

    let html = await renderPage({ mode: 'similar-to-vn', seed: 'v1' });
    expect(html).toContain('picker:v1');
    expect(html).toContain(dictionaries.en.recommend.explain.filterOwnedOff);
    expect(html).toContain(dictionaries.en.recommend.explain.filterWishlistOff);
    expect(html).toContain(dictionaries.en.recommend.explain.filterEroOff);

    html = await renderPage({ mode: 'similar-to-vn', seed: 'v2' });
    expect(html).toContain('picker:v2');
  });

  it('omits the explanation panel when signal counts are absent or empty', async () => {
    vi.mocked(recommendVns).mockImplementation(async (options): Promise<RecommendFixture> => fixture({
      seeds: [seed('g1')],
      signalCounts: options?.resultLimit === 0
        ? undefined
        : { finished: 0, rated: 0, favorite: 0, queue: 0, wishlist: 0, total: 0 },
      results: options?.resultLimit === 0 ? [] : [result('v1')],
    }));

    const html = await renderPage();

    expect(html).not.toContain(dictionaries.en.recommend.explain.title);
  });
});
