import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { SchemaEgsSection } from '@/components/SchemaEgsSection';
import { SchemaLocalSection } from '@/components/SchemaLocalSection';
import { StatsExtras } from '@/components/StatsExtras';
import { TagCoOccurrence } from '@/components/TagCoOccurrence';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  activityHeatmap: vi.fn(),
  bestRoi: vi.fn(),
  egsSummary: vi.fn(),
  localSchema: vi.fn(),
  ratingHistogram: vi.fn(),
  tagsCompletedPerYear: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  activityHeatmap: mocks.activityHeatmap,
  bestRoi: mocks.bestRoi,
  ratingHistogram: mocks.ratingHistogram,
  tagsCompletedPerYear: mocks.tagsCompletedPerYear,
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/lib/schema-local', () => ({
  listLocalSqliteSchema: mocks.localSchema,
}));

vi.mock('@/lib/schema-egs', () => ({
  getSchemaEgsSummary: mocks.egsSummary,
}));

vi.mock('@/components/CollapsibleSummary', () => ({
  CollapsibleSummary: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ScrollFadeRight', () => ({
  ScrollFadeRight: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

beforeEach(() => {
  mocks.activityHeatmap.mockReset().mockReturnValue([]);
  mocks.bestRoi.mockReset().mockReturnValue([]);
  mocks.egsSummary.mockReset().mockReturnValue({
    tables: [
      { key: 'egs_game', rowCount: 0, lastFetchedAt: null },
      { key: 'vndb_cache_egs', rowCount: 0, lastFetchedAt: null },
      { key: 'vn_egs_link', rowCount: 0, lastFetchedAt: null },
      { key: 'egs_vn_link', rowCount: 0, lastFetchedAt: null },
    ],
    staleWhileError: false,
    egsUsernameSet: false,
  });
  mocks.localSchema.mockReset().mockReturnValue([]);
  mocks.ratingHistogram.mockReset().mockReturnValue([]);
  mocks.tagsCompletedPerYear.mockReset().mockReturnValue([]);
});

describe('ActivityHeatmap', () => {
  it('renders padded calendar weeks, empty days, and clamped activity tones', async () => {
    mocks.activityHeatmap.mockReturnValue([
      { day: '2023-01-01', count: 1 },
      { day: '2023-01-02', count: 20 },
    ]);
    const html = renderToStaticMarkup(await ActivityHeatmap({ year: 2023 }));
    expect(html).toContain('2023');
    expect(html).toContain('21');
    expect(html).toContain('2');
    expect(html).toContain('<div class="h-[10px] w-[10px]"></div>');
    expect(html).toContain('bg-accent');
    expect(html).toContain('role="img"');
  });
});

describe('StatsExtras', () => {
  it('renders the histogram without optional sections for empty detail rows', async () => {
    mocks.ratingHistogram.mockReturnValue([{ bucket: '1', mine: 0, vndb: 0 }]);
    const html = renderToStaticMarkup(await StatsExtras());
    expect(html).toContain(dictionaries.en.statsExtras.histogramTitle);
    expect(html).not.toContain(dictionaries.en.statsExtras.roiTitle);
    expect(html).not.toContain(dictionaries.en.statsExtras.genreTitle);
  });

  it('renders ROI and multi-year genre rows including absent and zero-count tags', async () => {
    mocks.ratingHistogram.mockReturnValue([{ bucket: '8', mine: 2, vndb: 4 }]);
    mocks.bestRoi.mockReturnValue([{ id: 'v90001', title: 'High ROI', user_rating: 80, playtime_minutes: 120 }]);
    mocks.tagsCompletedPerYear.mockReturnValue([
      { year: 2022, tag: 'Drama', count: 0 },
      { year: 2023, tag: 'Drama', count: 2 },
      { year: 2023, tag: 'Comedy', count: 1 },
    ]);
    const html = renderToStaticMarkup(await StatsExtras());
    expect(html).toContain('href="/vn/v90001"');
    expect(html).toContain('High ROI');
    expect(html).toContain('Drama');
    expect(html).toContain('Comedy');
    expect(html).toContain('2022');
    expect(html).toContain('2023');
  });
});

describe('SchemaLocalSection', () => {
  it('renders table metadata and both boolean column states', async () => {
    mocks.localSchema.mockReturnValue([{
      name: 'collection',
      columns: [
        { name: 'id', type: 'TEXT', notnull: 1, pk: 1, dflt_value: null },
        { name: 'notes', type: '', notnull: 0, pk: 0, dflt_value: "''" },
      ],
    }]);
    const html = renderToStaticMarkup(await SchemaLocalSection());
    expect(html).toContain('aria-label="collection"');
    expect(html).toContain('TEXT');
    expect(html).toContain("&#x27;&#x27;");
    expect(html).toContain(dictionaries.en.common.yes);
    expect(html).toContain(dictionaries.en.common.no);
  });
});

describe('SchemaEgsSection', () => {
  it('renders the empty state for a fresh EGS cache', async () => {
    const html = renderToStaticMarkup(await SchemaEgsSection());
    expect(html).toContain(dictionaries.en.schemaEgs.empty);
  });

  it('renders every table label, stale marker, username marker, and date fallback', async () => {
    mocks.egsSummary.mockReturnValue({
      tables: [
        { key: 'egs_game', rowCount: 1, lastFetchedAt: Date.UTC(2026, 0, 1) },
        { key: 'vndb_cache_egs', rowCount: 2, lastFetchedAt: null },
        { key: 'vn_egs_link', rowCount: 3, lastFetchedAt: Number.NaN },
        { key: 'egs_vn_link', rowCount: 4, lastFetchedAt: Date.UTC(2026, 1, 1) },
      ],
      staleWhileError: true,
      egsUsernameSet: true,
    });
    const html = renderToStaticMarkup(await SchemaEgsSection());
    expect(html).toContain(dictionaries.en.schemaEgs.tableEgsGame);
    expect(html).toContain(dictionaries.en.schemaEgs.tableEgsCache);
    expect(html).toContain(dictionaries.en.schemaEgs.tableVnEgsLink);
    expect(html).toContain(dictionaries.en.schemaEgs.tableEgsVnLink);
    expect(html).toContain(dictionaries.en.schemaEgs.staleWhileError);
    expect(html).toContain(dictionaries.en.schemaEgs.neverFetched);
    expect(html).toContain(dictionaries.en.schemaEgs.set);
  });
});

describe('TagCoOccurrence', () => {
  it('renders positive, zero, known, unknown, and missing category rows', async () => {
    const html = renderToStaticMarkup(await TagCoOccurrence({
      rows: [
        { id: 'g 1', name: 'Drama', category: 'cont', shared: 4 },
        { id: 'g2', name: 'Erotic', category: 'ero', shared: 1 },
        { id: 'g3', name: 'Technical', category: 'tech', shared: 0 },
        { id: 'g4', name: 'Fallback', category: 'unknown', shared: 0 },
        { id: 'g5', name: 'No category', category: null, shared: 0 },
      ],
    }));
    expect(html).toContain('/?tag=g%201');
    expect(html).toContain('width:100%');
    expect(html).toContain('width:8%');
    expect(html).toContain('text-status-dropped');
    expect(html).toContain('text-status-on_hold');

    const zeroMaxHtml = renderToStaticMarkup(await TagCoOccurrence({
      rows: [{ id: 'g6', name: 'Zero max', category: null, shared: 0 }],
    }));
    expect(zeroMaxHtml).toContain('width:0%');
  });
});
