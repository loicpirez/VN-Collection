import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DataPage, { generateMetadata as generateDataMetadata } from '@/app/data/page';
import SchemaPage, { generateMetadata as generateSchemaMetadata } from '@/app/schema/page';
import YearPage, { generateMetadata as generateYearMetadata } from '@/app/year/page';
import SteamLayout, { generateMetadata as generateSteamMetadata } from '@/app/steam/layout';
import { getCacheFreshness, getDbStatus, getReadingGoal, yearReview } from '@/lib/db';
import { getAuthInfo, getSchema } from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/db', () => ({
  getCacheFreshness: vi.fn(),
  getDbStatus: vi.fn(),
  getReadingGoal: vi.fn(),
  yearReview: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getAuthInfo: vi.fn(),
  getSchema: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/ActivityHeatmap', () => ({
  ActivityHeatmap: ({ year }: { year: number }) => <div data-testid="heatmap">{year}</div>,
}));

vi.mock('@/components/CollapsibleSummary', () => ({
  CollapsibleSummary: ({ children }: { children: React.ReactNode }) => <span data-testid="summary">{children}</span>,
}));

vi.mock('@/components/DataMaintenance', () => ({
  DataMaintenance: () => <div data-testid="maintenance">maintenance</div>,
}));

vi.mock('@/components/DropImport', () => ({
  DropImport: () => <div data-testid="drop-import">drop import</div>,
}));

vi.mock('@/components/EgsSyncBlock', () => ({
  EgsSyncBlock: () => <div data-testid="egs-sync">egs sync</div>,
}));

vi.mock('@/components/ExportGameListButton', () => ({
  ExportGameListButton: () => <button type="button">export games</button>,
}));

vi.mock('@/components/ImportPanel', () => ({
  ImportPanel: () => <div data-testid="import-panel">import panel</div>,
}));

vi.mock('@/components/OpenSettingsButton', () => ({
  OpenSettingsButton: ({ label, tab }: { label: string; tab: string }) => <button type="button">{label}:{tab}</button>,
}));

vi.mock('@/components/RefreshScopeButton', () => ({
  RefreshScopeButton: ({ scope, lastUpdatedAt }: { scope: string; lastUpdatedAt: number | null }) => (
    <button type="button">{scope}:{String(lastUpdatedAt)}</button>
  ),
}));

vi.mock('@/components/SchemaBrowser', () => ({
  SchemaBrowser: ({ schema }: { schema: unknown }) => <pre data-testid="schema-browser">{JSON.stringify(schema)}</pre>,
}));

vi.mock('@/components/SchemaEgsSection', () => ({
  SchemaEgsSection: () => <section data-testid="schema-egs">egs schema</section>,
}));

vi.mock('@/components/SchemaLocalSection', () => ({
  SchemaLocalSection: () => <section data-testid="schema-local">local schema</section>,
}));

vi.mock('@/components/SelectiveFullDownload', () => ({
  SelectiveFullDownload: () => <div data-testid="selective-download">selective download</div>,
}));

function dbStatus(overrides: Partial<ReturnType<typeof getDbStatus>> = {}): ReturnType<typeof getDbStatus> {
  return {
    db_path: '/tmp/collection.db',
    rows: [{ table: 'vn', count: 2 }],
    egs_matched: 3,
    egs_unmatched: 1,
    cache_total: 8,
    cache_fresh: 5,
    cache_stale: 3,
    vndb_token: 'db',
    ...overrides,
  };
}

function review(overrides: Partial<ReturnType<typeof yearReview>> = {}): ReturnType<typeof yearReview> {
  return {
    year: 2025,
    completed: 4,
    hours: 120,
    topTags: [{ id: 'g1', name: 'Drama', count: 2 }],
    topGenres: [],
    avgUserRating: 87,
    best: [{ id: 'v1', title: 'Best VN', rating: 92 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getDbStatus).mockReset().mockReturnValue(dbStatus());
  vi.mocked(getAuthInfo).mockReset().mockResolvedValue({ id: 'u1', username: 'alice', permissions: ['listread'] });
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(123);
  vi.mocked(getSchema).mockReset().mockResolvedValue({ enums: { platform: ['win'] } });
  vi.mocked(yearReview).mockReset().mockReturnValue(review());
  vi.mocked(getReadingGoal).mockReset().mockReturnValue({ year: 2025, target: 8, updated_at: 1 });
});

describe('support app pages runtime', () => {
  it('renders data metadata, authenticated status, and operational sections', async () => {
    expect(await generateDataMetadata()).toEqual({ title: dictionaries.en.nav.data });

    const html = renderToStaticMarkup(await DataPage());

    expect(html).toContain('Backup');
    expect(html).toContain('alice');
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbSourceDb);
    expect(html).toContain('/api/export/csv');
    expect(html).toContain('export games');
    expect(html).toContain('import panel');
    expect(html).toContain('maintenance');
    expect(html).toContain('egs sync');
  });

  it('renders data VNDB token warning and missing-token branches', async () => {
    vi.mocked(getDbStatus).mockReturnValueOnce(dbStatus({ vndb_token: 'env' }));
    let html = renderToStaticMarkup(await DataPage());
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbSourceEnv);

    vi.mocked(getAuthInfo).mockRejectedValue(new Error('auth failed'));
    vi.mocked(getDbStatus).mockReturnValueOnce(dbStatus({ vndb_token: 'env' }));
    html = renderToStaticMarkup(await DataPage());
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbInvalid);
    expect(html).toContain('auth failed');

    vi.mocked(getDbStatus).mockReturnValueOnce(dbStatus({ vndb_token: 'none' }));
    html = renderToStaticMarkup(await DataPage());
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbNone);
  });

  it('renders schema metadata, cache controls, success, and upstream error states', async () => {
    expect(await generateSchemaMetadata()).toEqual({ title: dictionaries.en.schemaPage.pageTitle });

    let html = renderToStaticMarkup(await SchemaPage());
    expect(html).toContain('schema:123');
    expect(html).toContain('local schema');
    expect(html).toContain('egs schema');
    expect(html).toContain('&quot;platform&quot;');

    vi.mocked(getSchema).mockRejectedValueOnce(new Error('schema offline'));
    html = renderToStaticMarkup(await SchemaPage());
    expect(html).toContain('schema offline');
  });

  it('renders year metadata, goal progress, rankings, and empty optional sections', async () => {
    expect(await generateYearMetadata({ searchParams: Promise.resolve({ y: '2025' }) })).toEqual({
      title: dictionaries.en.year.title.replace('{year}', '2025'),
    });
    expect(await generateYearMetadata({ searchParams: Promise.resolve({ y: 'bad' }) })).toEqual({
      title: dictionaries.en.year.title.replace('{year}', String(new Date().getFullYear())),
    });

    let html = renderToStaticMarkup(await YearPage({ searchParams: Promise.resolve({ y: '2025' }) }));
    expect(yearReview).toHaveBeenCalledWith(2025);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('50%');
    expect(html).toContain('Drama');
    expect(html).toContain('Best VN');
    expect(html).toContain('9.2');
    expect(html).toContain('2025');

    vi.mocked(yearReview).mockReturnValueOnce(review({ completed: 0, avgUserRating: null, topTags: [], best: [] }));
    vi.mocked(getReadingGoal).mockReturnValueOnce(null);
    html = renderToStaticMarkup(await YearPage({ searchParams: Promise.resolve({ y: '0' }) }));
    expect(html).toContain('>-</div>');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain(dictionaries.en.year.topTags);
    expect(html).not.toContain(dictionaries.en.year.best);
  });

  it('renders steam layout metadata and children', async () => {
    expect(await generateSteamMetadata()).toEqual({ title: dictionaries.en.settings.steamTitle });
    expect(renderToStaticMarkup(<SteamLayout><span>steam child</span></SteamLayout>)).toContain('steam child');
  });
});
