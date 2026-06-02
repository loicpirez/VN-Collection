import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import EgsPage, { generateMetadata as generateEgsMetadata } from '@/app/egs/page';

interface LinkedRow {
  vn_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  egs_id: number;
  median: number | null;
  playtime_minutes: number | null;
  source: string | null;
}

interface UnlinkedRow {
  vn_id: string;
  vn_title: string;
  vn_alttitle: string | null;
  vn_image_thumb: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
}

const dbMocks = vi.hoisted(() => ({
  links: [] as LinkedRow[],
  unmatched: 0,
  unlinkedRows: [] as UnlinkedRow[],
  error: null as Error | null,
  prepare: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: dbMocks.prepare,
  },
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => (await import('@/lib/i18n/dictionaries')).dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/EgsSyncBlock', () => ({
  EgsSyncBlock: () => <div data-testid="sync-block" />,
}));

vi.mock('@/components/MapVnToEgsButton', () => ({
  MapVnToEgsButton: ({
    seedQuery,
    variant,
    vnId,
  }: {
    seedQuery: string;
    variant: string;
    vnId: string;
  }) => <button type="button">map:{vnId}:{seedQuery}:{variant}</button>,
}));

vi.mock('@/components/ResetViewDefaultsButton', () => ({
  ResetViewDefaultsButton: ({ scope }: { scope: string }) => <button type="button">reset:{scope}</button>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({
    alt,
    localSrc,
    src,
  }: {
    alt: string;
    localSrc?: string | null;
    src?: string | null;
  }) => <img alt={alt} src={localSrc ?? src ?? undefined} />,
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonCardGrid: ({ count }: { count: number }) => <div data-testid="skeleton-cards">{count}</div>,
  SkeletonRows: ({ count }: { count: number }) => <div data-testid="skeleton-rows">{count}</div>,
}));

async function renderPage(): Promise<string> {
  const stream = await renderToReadableStream(await EgsPage());
  await stream.allReady;
  return new Response(stream).text();
}

function link(vnId: string, overrides: Partial<LinkedRow> = {}): LinkedRow {
  return {
    vn_id: vnId,
    vn_title: `Linked ${vnId}`,
    vn_image_thumb: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    egs_id: Number(vnId.replace(/\D/g, '')) || 1,
    median: null,
    playtime_minutes: null,
    source: null,
    ...overrides,
  };
}

function unlinked(vnId: string, overrides: Partial<UnlinkedRow> = {}): UnlinkedRow {
  return {
    vn_id: vnId,
    vn_title: `Unlinked ${vnId}`,
    vn_alttitle: null,
    vn_image_thumb: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.links = [];
  dbMocks.unmatched = 0;
  dbMocks.unlinkedRows = [];
  dbMocks.error = null;
  dbMocks.prepare.mockReset().mockImplementation((sql: string) => {
    if (dbMocks.error) throw dbMocks.error;
    if (sql.includes('SELECT COUNT(*) AS n')) {
      return { get: () => ({ n: dbMocks.unmatched }) };
    }
    if (sql.includes('FROM egs_game e\n        JOIN vn v')) {
      return { all: () => dbMocks.links };
    }
    return { all: () => dbMocks.unlinkedRows };
  });
});

describe('EGS integration page runtime', () => {
  it('generates localized metadata and renders the linked-empty state', async () => {
    expect(await generateEgsMetadata()).toEqual({ title: 'ErogameScape' });

    const html = await renderPage();

    expect(html).toContain('ErogameScape');
    expect(html).toContain('data-testid="sync-block"');
    expect(html).toContain('No VN linked to EGS yet.');
    expect(html).not.toContain('role="alert"');
  });

  it('renders source vocabularies, EGS metrics, mapping controls, and unlinked overflow hints', async () => {
    dbMocks.links = [
      link('v1', {
        vn_image_thumb: 'https://example.test/v1.jpg',
        source: 'extlink',
        median: 88,
        playtime_minutes: 120,
      }),
      link('v2', { vn_local_image_thumb: '/local/v2.jpg', source: 'search', playtime_minutes: 0 }),
      link('v3', { source: 'manual' }),
      link('v4', { source: null }),
      link('v5', { source: '' }),
      link('v6', { source: 'custom' }),
    ];
    dbMocks.unmatched = 4;
    dbMocks.unlinkedRows = [
      unlinked('v7', {
        vn_alttitle: 'Alternative title',
        vn_image_thumb: 'https://example.test/v7.jpg',
      }),
      unlinked('v8'),
    ];

    const html = await renderPage();

    expect(html).toContain('6<!-- --> <!-- -->EGS links');
    expect(html).toContain('4 VN(s) without EGS link');
    expect(html).toContain('https://example.test/v1.jpg');
    expect(html).toContain('/local/v2.jpg');
    expect(html).toContain('88/100');
    expect(html).toContain('2h');
    expect(html).toContain('EGS extlink');
    expect(html).toContain('EGS auto');
    expect(html).toContain('EGS manual');
    expect(html).toContain('No EGS counterpart');
    expect(html).toContain('custom');
    expect(html).toContain('href="https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=1"');
    expect(html).toContain('map:<!-- -->v1<!-- -->:<!-- -->Linked v1<!-- -->:<!-- -->compact');
    expect(html).toContain('Alternative title');
    expect(html).toContain('map:<!-- -->v7<!-- -->:<!-- -->Alternative title<!-- -->:<!-- -->compact');
    expect(html).toContain('map:<!-- -->v8<!-- -->:<!-- -->Unlinked v8<!-- -->:<!-- -->compact');
    expect(html).toContain('+2 more unlinked VNs.');
  });

  it('renders the recoverable database error band while preserving the sync block', async () => {
    dbMocks.error = new Error('database unavailable');

    const html = await renderPage();

    expect(html).toContain('role="alert"');
    expect(html).toContain('database unavailable');
    expect(html).toContain('data-testid="sync-block"');
    expect(html).toContain('No VN linked to EGS yet.');
  });
});
