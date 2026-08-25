import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StatsPage, { generateMetadata } from '@/app/stats/page';
import type { AggregateStats } from '@/lib/db';
import { getAuthInfo, getGlobalStats } from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ProducerStat } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  databaseBackend: 'sqlite' as 'sqlite' | 'postgres',
  averageRating: null as number | null,
  favorites: 0,
  personal: vi.fn(),
  aggregate: vi.fn(),
  developerStats: vi.fn(),
  publisherStats: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({ backend: mocks.databaseBackend }),
}));

vi.mock('@/lib/db/repositories/producer', () => ({
  getProducerRepository: () => ({
    listDeveloperStats: mocks.developerStats,
    listPublisherStats: mocks.publisherStats,
  }),
}));

vi.mock('@/lib/db/repositories/analytics', () => ({
  getAnalyticsRepository: () => ({
    personal: mocks.personal,
    aggregate: mocks.aggregate,
  }),
}));

vi.mock('@/lib/vndb', () => ({
  getAuthInfo: vi.fn(),
  getGlobalStats: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CachePanel', () => ({
  CachePanel: () => <div data-testid="cache-panel" />,
}));

vi.mock('@/components/ImportPanel', () => ({
  ImportPanel: ({ backend }: { backend: 'sqlite' | 'postgres' }) => (
    <div data-testid="import-panel" data-backend={backend} />
  ),
}));

vi.mock('@/components/ReadingGoalCard', () => ({
  ReadingGoalCard: ({ year }: { year: number }) => <div data-testid="reading-goal">{year}</div>,
}));

vi.mock('@/components/StatsExtras', () => ({
  StatsExtras: () => <div data-testid="stats-extras" />,
}));

vi.mock('@/components/charts/BarChart', () => ({
  HBarChart: ({ data }: { data: Array<Record<string, unknown>> }) => <pre data-chart="horizontal">{JSON.stringify(data)}</pre>,
  VBarChart: ({ data }: { data: Array<Record<string, unknown>> }) => <pre data-chart="vertical">{JSON.stringify(data)}</pre>,
  DonutChart: ({ data }: { data: Array<Record<string, unknown>> }) => <pre data-chart="donut">{JSON.stringify(data)}</pre>,
}));

function aggregate(overrides: Partial<AggregateStats> = {}): AggregateStats {
  return {
    ratingDistribution: [],
    finishedByMonth: [],
    byLanguage: [],
    byPlatform: [],
    byLocation: [],
    byEdition: [],
    topTags: [],
    byYear: [],
    egs: {
      matched: 0,
      unmatched: 0,
      avg_median: null,
      sum_playtime_minutes: 0,
    },
    ...overrides,
  };
}

function producer(id: string, name: string, vnCount: number): ProducerStat {
  return {
    id,
    name,
    original: null,
    lang: null,
    type: null,
    description: null,
    aliases: [],
    extlinks: [],
    logo_path: null,
    fetched_at: 0,
    vn_count: vnCount,
    avg_user_rating: null,
    avg_rating: null,
  };
}

beforeEach(() => {
  mocks.databaseBackend = 'sqlite';
  mocks.averageRating = null;
  mocks.favorites = 0;
  mocks.personal.mockReset().mockResolvedValue({
    total: 0,
    playtime_minutes: 0,
    byStatus: [],
    favorites: 0,
    avg_user_rating: null,
  });
  mocks.aggregate.mockReset().mockResolvedValue(aggregate());
  mocks.developerStats.mockReset().mockResolvedValue([]);
  mocks.publisherStats.mockReset().mockResolvedValue([]);
  vi.mocked(getGlobalStats).mockReset().mockResolvedValue({
    vn: 1,
    releases: 2,
    chars: 3,
    producers: 4,
    staff: 5,
    tags: 6,
    traits: 7,
  });
  vi.mocked(getAuthInfo).mockReset().mockResolvedValue(null);
});

describe('stats page runtime', () => {
  it('renders localized metadata and the empty-library state while preserving remote failures', async () => {
    vi.mocked(getGlobalStats).mockRejectedValue(new Error('VNDB unavailable'));

    expect(await generateMetadata()).toEqual({ title: dictionaries.en.nav.stats });
    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain(dictionaries.en.stats.emptyTitle);
    expect(html).toContain('href="/search"');
    expect(html).toContain('VNDB unavailable');
    expect(html).toContain(dictionaries.en.stats.anonymous);
    expect(html).toContain('data-testid="cache-panel"');
    expect(html).toContain('data-testid="import-panel"');
    expect(html).toContain('data-backend="sqlite"');
    expect(html).not.toContain('data-chart=');
  });

  it('passes the PostgreSQL backend to the import surface', async () => {
    mocks.databaseBackend = 'postgres';

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain('data-backend="postgres"');
  });

  it('renders every populated dashboard section and projects chart links', async () => {
    const currentMonth = new Date();
    const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    mocks.averageRating = 87;
    mocks.favorites = 2;
    mocks.personal.mockResolvedValue({
      total: 3,
      playtime_minutes: 150,
      favorites: mocks.favorites,
      avg_user_rating: mocks.averageRating,
      byStatus: [
        { status: 'playing', n: 2 },
        { status: 'dropped', n: 1 },
      ],
    });
    mocks.aggregate.mockResolvedValue(aggregate({
      ratingDistribution: [{ bucket: 8, count: 2 }, { bucket: 9, count: 0 }],
      finishedByMonth: [{ month, count: 1, minutes: 150 }],
      byLanguage: [{ lang: 'ja', count: 3 }],
      byPlatform: [{ platform: 'win', count: 3 }],
      byLocation: [{ location: 'shelf', count: 2 }, { location: 'unknown', count: 1 }, { location: 'custom', count: 1 }],
      byEdition: [{ edition: 'limited', count: 2 }, { edition: 'none', count: 1 }, { edition: 'custom', count: 1 }],
      topTags: [{ id: 'g 1', name: 'Drama', count: 3 }],
      byYear: [{ year: '2001', count: 1 }, { year: '2024', count: 2 }],
      egs: {
        matched: 2,
        unmatched: 1,
        avg_median: 74.5,
        sum_playtime_minutes: 60,
      },
    }));
    mocks.developerStats.mockResolvedValue([producer('p1', 'Developer', 4)]);
    mocks.publisherStats.mockResolvedValue([producer('p2', 'Publisher', 3)]);
    vi.mocked(getAuthInfo).mockResolvedValue({ id: 'u1', username: 'reader', permissions: ['listread'] });

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain(dictionaries.en.stats.mySubtitle);
    expect(html).toContain(dictionaries.en.stats.egsTitle);
    expect(html).toContain(dictionaries.en.charts.finishedByMonth);
    expect(html).toContain(dictionaries.en.charts.ratingDistribution);
    expect(html).toContain(dictionaries.en.charts.topTags);
    expect(html).toContain(dictionaries.en.charts.byLanguage);
    expect(html).toContain(dictionaries.en.charts.byPlatform);
    expect(html).toContain(dictionaries.en.charts.byLocation);
    expect(html).toContain(dictionaries.en.charts.byEdition);
    expect(html).toContain(dictionaries.en.charts.byYear);
    expect(html).toContain(dictionaries.en.charts.topDevelopers);
    expect(html).toContain(dictionaries.en.charts.topPublishers);
    expect(html).toContain('/?status=playing');
    expect(html).toContain('/?tag=g%201');
    expect(html).toContain('/search?langs=ja');
    expect(html).toContain('/search?platforms=win');
    expect(html).toContain('/?place=shelf');
    expect(html).toContain('/?edition=limited');
    expect(html).toContain('/producer/p1');
    expect(html).toContain('/producer/p2');
    expect(html).toContain('https://vndb.org/u1');
    expect(html).toContain('listread');
  });

  it('keeps malformed year labels and handles zero EGS median plus permission-free auth', async () => {
    mocks.personal.mockResolvedValue({
      total: 1,
      playtime_minutes: 0,
      byStatus: [],
      favorites: 0,
      avg_user_rating: null,
    });
    mocks.aggregate.mockResolvedValue(aggregate({
      byYear: [{ year: 'unknown', count: 1 }],
      egs: {
        matched: 0,
        unmatched: 1,
        avg_median: null,
        sum_playtime_minutes: 0,
      },
    }));
    mocks.publisherStats.mockResolvedValue([producer('p3', 'Publisher only', 1)]);
    vi.mocked(getAuthInfo).mockResolvedValue({ id: 'u2', username: 'guest', permissions: [] });

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain('unknown');
    expect(html).toContain('https://vndb.org/u2');
    expect(html).not.toContain(`${dictionaries.en.stats.permissions}:`);
    expect(html).toContain(dictionaries.en.charts.topPublishers);
    expect(html).not.toContain(dictionaries.en.charts.topDevelopers);
  });

  it('renders individual years when the release-year span is small', async () => {
    mocks.personal.mockResolvedValue({
      total: 1,
      playtime_minutes: 0,
      byStatus: [],
      favorites: 0,
      avg_user_rating: null,
    });
    mocks.aggregate.mockResolvedValue(aggregate({
      byYear: [{ year: '2020', count: 1 }, { year: '2022', count: 2 }],
    }));

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain('/?yearMin=2020&amp;yearMax=2020');
    expect(html).toContain('/?yearMin=2022&amp;yearMax=2022');
  });

  it('falls back for unknown status labels and skips non-numeric years in wide ranges', async () => {
    mocks.personal.mockResolvedValue({
      total: 2,
      playtime_minutes: 0,
      byStatus: [{ status: 'custom_status', n: 1 }],
      favorites: 0,
      avg_user_rating: null,
    });
    mocks.aggregate.mockResolvedValue(aggregate({
      byYear: [{ year: '1990', count: 1 }, { year: '200x', count: 9 }, { year: '2025', count: 2 }],
    }));

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain('custom_status');
    expect(html).toContain('1990-1994');
    expect(html).toContain('2025-2029');
    expect(html).not.toContain('200x: 9');
  });
});
