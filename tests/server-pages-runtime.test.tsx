import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DataPage, { generateMetadata as generateDataMetadata } from '@/app/data/page';
import SchemaPage, { generateMetadata as generateSchemaMetadata } from '@/app/schema/page';
import SteamLayout, { generateMetadata as generateSteamMetadata } from '@/app/steam/layout';
import YearPage, { generateMetadata as generateYearMetadata } from '@/app/year/page';
import {
  getCacheFreshness,
  getDbStatus,
  getReadingGoal,
  yearReview,
  type DbStatus,
  type ReadingGoal,
  type YearReview,
} from '@/lib/db';
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

vi.mock('@/components/DataMaintenance', () => ({
  DataMaintenance: () => <div data-testid="maintenance" />,
}));

vi.mock('@/components/DropImport', () => ({
  DropImport: () => <div data-testid="drop-import" />,
}));

vi.mock('@/components/EgsSyncBlock', () => ({
  EgsSyncBlock: () => <div data-testid="egs-sync" />,
}));

vi.mock('@/components/ExportGameListButton', () => ({
  ExportGameListButton: () => <button type="button">game-list</button>,
}));

vi.mock('@/components/ImportPanel', () => ({
  ImportPanel: () => <div data-testid="import-panel" />,
}));

vi.mock('@/components/OpenSettingsButton', () => ({
  OpenSettingsButton: ({ tab, label }: { tab: string; label: string }) => <button type="button" data-tab={tab}>{label}</button>,
}));

vi.mock('@/components/SelectiveFullDownload', () => ({
  SelectiveFullDownload: () => <div data-testid="selective-download" />,
}));

vi.mock('@/components/CollapsibleSummary', () => ({
  CollapsibleSummary: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/RefreshScopeButton', () => ({
  RefreshScopeButton: ({ scope, lastUpdatedAt }: { scope: string; lastUpdatedAt?: number | null }) => (
    <button type="button" data-scope={scope}>{lastUpdatedAt ?? 'none'}</button>
  ),
}));

vi.mock('@/components/SchemaBrowser', () => ({
  SchemaBrowser: ({ schema }: { schema: unknown }) => <pre data-testid="schema-browser">{JSON.stringify(schema)}</pre>,
}));

vi.mock('@/components/SchemaEgsSection', () => ({
  SchemaEgsSection: () => <div data-testid="schema-egs" />,
}));

vi.mock('@/components/SchemaLocalSection', () => ({
  SchemaLocalSection: () => <div data-testid="schema-local" />,
}));

function dbStatus(overrides: Partial<DbStatus> = {}): DbStatus {
  return {
    db_path: '/tmp/collection.db',
    rows: [{ table: 'vn', count: 12 }],
    egs_matched: 2,
    egs_unmatched: 1,
    cache_total: 5,
    cache_fresh: 4,
    cache_stale: 1,
    vndb_token: 'none',
    ...overrides,
  };
}

function review(overrides: Partial<YearReview> = {}): YearReview {
  return {
    year: 2026,
    completed: 0,
    hours: 0,
    topTags: [],
    topGenres: [],
    avgUserRating: null,
    best: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(null);
  vi.mocked(getDbStatus).mockReset().mockReturnValue(dbStatus());
  vi.mocked(getReadingGoal).mockReset().mockReturnValue(null);
  vi.mocked(yearReview).mockReset().mockReturnValue(review());
  vi.mocked(getAuthInfo).mockReset().mockResolvedValue(null);
  vi.mocked(getSchema).mockReset().mockResolvedValue({ enums: { platform: ['win'] } });
});

describe('data page runtime', () => {
  it('renders metadata, authenticated DB-token status, row counts, and operation entry points', async () => {
    vi.mocked(getDbStatus).mockReturnValue(dbStatus({ vndb_token: 'db' }));
    vi.mocked(getAuthInfo).mockResolvedValue({ id: 'u1', username: 'reader', permissions: [] });

    expect(await generateDataMetadata()).toEqual({ title: dictionaries.en.nav.data });
    const html = renderToStaticMarkup(await DataPage());

    expect(html).toContain('reader');
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbSourceDb);
    expect(html).toContain('/tmp/collection.db');
    expect(html).toContain('>vn</th>');
    expect(html).toContain('>12</td>');
    expect(html).toContain('href="/api/export/csv"');
    expect(html).toContain('href="/labels"');
    expect(html).toContain('data-testid="maintenance"');
    expect(html).toContain('data-testid="drop-import"');
    expect(html).toContain('data-testid="selective-download"');
  });

  it('renders muted missing-token status and warning status with auth errors', async () => {
    let html = renderToStaticMarkup(await DataPage());
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbNone);
    expect(html).toContain('text-muted');

    vi.mocked(getDbStatus).mockReturnValue(dbStatus({ vndb_token: 'env' }));
    vi.mocked(getAuthInfo).mockRejectedValue(new Error('invalid token'));
    html = renderToStaticMarkup(await DataPage());
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbInvalid);
    expect(html).toContain('invalid token');
    expect(html).toContain('text-status-dropped');
  });

  it('renders the environment-token source for authenticated status', async () => {
    vi.mocked(getDbStatus).mockReturnValue(dbStatus({ vndb_token: 'env' }));
    vi.mocked(getAuthInfo).mockResolvedValue({ id: 'u2', username: 'env-reader', permissions: [] });

    const html = renderToStaticMarkup(await DataPage());

    expect(html).toContain('env-reader');
    expect(html).toContain(dictionaries.en.dataMgmt.statusVndbSourceEnv);
  });
});

describe('schema page runtime', () => {
  it('renders metadata, cache freshness, local and EGS summaries, and VNDB schema', async () => {
    vi.mocked(getCacheFreshness).mockReturnValue(123);

    expect(await generateSchemaMetadata()).toEqual({ title: dictionaries.en.schemaPage.pageTitle });
    const html = renderToStaticMarkup(await SchemaPage());

    expect(html).toContain('data-scope="schema"');
    expect(html).toContain('>123</button>');
    expect(html).toContain('data-testid="schema-local"');
    expect(html).toContain('data-testid="schema-egs"');
    expect(html).toContain('data-testid="schema-browser"');
    expect(html).toContain('&quot;platform&quot;:[&quot;win&quot;]');
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /schema|%']);
  });

  it('renders the VNDB schema error while preserving local sections', async () => {
    vi.mocked(getSchema).mockRejectedValue(new Error('schema unavailable'));

    const html = renderToStaticMarkup(await SchemaPage());

    expect(html).toContain('schema unavailable');
    expect(html).toContain('data-testid="schema-local"');
    expect(html).not.toContain('data-testid="schema-browser"');
  });
});

describe('steam layout runtime', () => {
  it('renders localized metadata and passes children through unchanged', async () => {
    expect(await generateSteamMetadata()).toEqual({ title: dictionaries.en.settings.steamTitle });
    expect(renderToStaticMarkup(<SteamLayout><span>steam-child</span></SteamLayout>)).toBe('<span>steam-child</span>');
  });
});

describe('year page runtime', () => {
  it('normalizes invalid years in metadata and renders a zero-goal summary without optional lists', async () => {
    const currentYear = new Date().getFullYear();
    const zeroGoal: ReadingGoal = { year: currentYear, target: 0, updated_at: 1 };
    vi.mocked(getReadingGoal).mockReturnValue(zeroGoal);

    expect(await generateYearMetadata({ searchParams: Promise.resolve({ y: 'invalid' }) })).toEqual({
      title: dictionaries.en.year.title.replace('{year}', String(currentYear)),
    });
    const html = renderToStaticMarkup(await YearPage({ searchParams: Promise.resolve({ y: '1979' }) }));

    expect(html).toContain(String(currentYear));
    expect(html).toContain('data-testid="heatmap"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain(dictionaries.en.year.topTags);
    expect(html).not.toContain(dictionaries.en.year.best);
  });

  it('renders a clamped goal, rating, tags, best entries, and year navigation for a valid year', async () => {
    vi.mocked(yearReview).mockReturnValue(review({
      year: 2025,
      completed: 15,
      hours: 42,
      avgUserRating: 87,
      topTags: [{ id: 'g 1', name: 'Drama', count: 3 }],
      best: [{ id: 'v1', title: 'Best VN', rating: 92 }],
    }));
    vi.mocked(getReadingGoal).mockReturnValue({ year: 2025, target: 10, updated_at: 1 });

    expect(await generateYearMetadata({ searchParams: Promise.resolve({ y: '2025' }) })).toEqual({
      title: dictionaries.en.year.title.replace('{year}', '2025'),
    });
    const html = renderToStaticMarkup(await YearPage({ searchParams: Promise.resolve({ y: '2025' }) }));

    expect(html).toContain('href="/year?y=2024"');
    expect(html).toContain('href="/year?y=2026"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('href="/?tag=g%201"');
    expect(html).toContain('href="/vn/v1"');
    expect(html).toContain('Best VN');
    expect(html).toContain('9.2');
  });
});
