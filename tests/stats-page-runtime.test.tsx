import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StatsPage, { generateMetadata } from '@/app/stats/page';
import {
  getAggregateStats,
  getStats,
  listProducerStats,
  listPublisherStats,
  type AggregateStats,
} from '@/lib/db';
import { getAuthInfo, getGlobalStats } from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ProducerStat } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  averageRating: null as number | null,
  favorites: 0,
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(() => sql.includes('favorite = 1') ? { n: mocks.favorites } : { m: mocks.averageRating }),
    })),
  },
  getAggregateStats: vi.fn(),
  getStats: vi.fn(),
  listProducerStats: vi.fn(),
  listPublisherStats: vi.fn(),
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
  ImportPanel: () => <div data-testid="import-panel" />,
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
  mocks.averageRating = null;
  mocks.favorites = 0;
  vi.mocked(getStats).mockReset().mockReturnValue({ total: 0, playtime_minutes: 0, byStatus: [] });
  vi.mocked(getAggregateStats).mockReset().mockReturnValue(aggregate());
  vi.mocked(listProducerStats).mockReset().mockReturnValue([]);
  vi.mocked(listPublisherStats).mockReset().mockReturnValue([]);
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
    expect(html).not.toContain('data-chart=');
  });

  it('renders every populated dashboard section and projects chart links', async () => {
    const currentMonth = new Date();
    const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    mocks.averageRating = 87;
    mocks.favorites = 2;
    vi.mocked(getStats).mockReturnValue({
      total: 3,
      playtime_minutes: 150,
      byStatus: [
        { status: 'playing', n: 2 },
        { status: 'dropped', n: 1 },
      ],
    });
    vi.mocked(getAggregateStats).mockReturnValue(aggregate({
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
    vi.mocked(listProducerStats).mockReturnValue([producer('p1', 'Developer', 4)]);
    vi.mocked(listPublisherStats).mockReturnValue([producer('p2', 'Publisher', 3)]);
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
    vi.mocked(getStats).mockReturnValue({
      total: 1,
      playtime_minutes: 0,
      byStatus: [],
    });
    vi.mocked(getAggregateStats).mockReturnValue(aggregate({
      byYear: [{ year: 'unknown', count: 1 }],
      egs: {
        matched: 0,
        unmatched: 1,
        avg_median: null,
        sum_playtime_minutes: 0,
      },
    }));
    vi.mocked(listPublisherStats).mockReturnValue([producer('p3', 'Publisher only', 1)]);
    vi.mocked(getAuthInfo).mockResolvedValue({ id: 'u2', username: 'guest', permissions: [] });

    const html = renderToStaticMarkup(await StatsPage());

    expect(html).toContain('unknown');
    expect(html).toContain('https://vndb.org/u2');
    expect(html).not.toContain(`${dictionaries.en.stats.permissions}:`);
    expect(html).toContain(dictionaries.en.charts.topPublishers);
    expect(html).not.toContain(dictionaries.en.charts.topDevelopers);
  });
});
