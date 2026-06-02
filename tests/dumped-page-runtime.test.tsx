import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DumpedPage, { generateMetadata as generateDumpedMetadata } from '@/app/dumped/page';
import { getDumpSummary, listDumpStatus, listVnIdsOnShelf, type DumpStatusEntry, type DumpSummary } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  getDumpSummary: vi.fn(),
  listDumpStatus: vi.fn(),
  listVnIdsOnShelf: vi.fn(),
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

vi.mock('@/components/DumpIgnoreButton', () => ({
  DumpIgnoreButton: ({ ignored, vnId }: { ignored: boolean; vnId: string }) => <button type="button">ignore:{vnId}:{String(ignored)}</button>,
}));

vi.mock('@/components/PaginatedGrid', () => ({
  PaginatedGrid: ({ children, resetKey }: { children: React.ReactNode; resetKey: string }) => <ul data-reset-key={resetKey}>{children}</ul>,
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

function summary(overrides: Partial<DumpSummary> = {}): DumpSummary {
  return {
    totalVns: 0,
    totalEditions: 0,
    dumpedEditions: 0,
    fullyDumpedVns: 0,
    editionPct: 0,
    ...overrides,
  };
}

function entry(
  vnId: string,
  overrides: Partial<DumpStatusEntry> = {},
): DumpStatusEntry {
  return {
    vn_id: vnId,
    vn_title: `Visual novel ${vnId}`,
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    total_editions: 1,
    dumped_editions: 0,
    collection_dumped: false,
    dumped_ignored: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getDumpSummary).mockReset().mockReturnValue(summary());
  vi.mocked(listDumpStatus).mockReset().mockReturnValue([]);
  vi.mocked(listVnIdsOnShelf).mockReset().mockReturnValue(new Set());
});

describe('dump tracker page runtime', () => {
  it('generates localized metadata and renders the empty summary state', async () => {
    expect(await generateDumpedMetadata()).toEqual({ title: 'Dump tracker' });

    const html = renderToStaticMarkup(await DumpedPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Dump tracker');
    expect(html).toContain('No VNs in the collection yet.');
    expect(html).not.toContain('data-scope="dumped"');
  });

  it('renders tracked buckets, clamps summary progress, and links shelf placements', async () => {
    vi.mocked(getDumpSummary).mockReturnValue(summary({ totalVns: 1, fullyDumpedVns: 2 }));
    vi.mocked(listDumpStatus).mockReturnValue([
      entry('v1', { collection_dumped: true, vn_image_thumb: 'https://example.test/thumb.jpg' }),
      entry('v2', { total_editions: 2, dumped_editions: 2, vn_local_image_thumb: '/local/v2.jpg' }),
      entry('v3', { total_editions: 2, dumped_editions: 1 }),
      entry('v4', { total_editions: 0 }),
      entry('v5', { dumped_ignored: true }),
    ]);
    vi.mocked(listVnIdsOnShelf).mockReturnValue(new Set(['v3']));

    const html = renderToStaticMarkup(await DumpedPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('Visual novel v1');
    expect(html).toContain('Visual novel v2');
    expect(html).toContain('Visual novel v3');
    expect(html).not.toContain('Visual novel v4');
    expect(html).not.toContain('Visual novel v5');
    expect(html).toContain('https://example.test/thumb.jpg');
    expect(html).toContain('/local/v2.jpg');
    expect(html).toContain('href="/shelf?view=layout&amp;highlight=v3"');
    expect(html).toContain('ignore:v3:false');
    expect(html).toContain('>Dumped<span');
    expect(html).toContain('>Missing<span');
    expect(html).toContain('>No editions<span');
    expect(html).toContain('>Ignored<span');
  });

  it('uses the first tab query value and renders the no-edition CTA anchor', async () => {
    vi.mocked(getDumpSummary).mockReturnValue(summary({ totalVns: 1 }));
    vi.mocked(listDumpStatus).mockReturnValue([entry('v4', { total_editions: 0 })]);

    const html = renderToStaticMarkup(await DumpedPage({
      searchParams: Promise.resolve({ tab: ['none', 'missing'] }),
    }));

    expect(html).toContain('data-reset-key="none"');
    expect(html).toContain('No owned editions');
    expect(html).toContain('Add an edition');
    expect(html).toContain('href="/vn/v4#my-editions"');
  });

  it('renders ignored entries in their dedicated tab', async () => {
    vi.mocked(getDumpSummary).mockReturnValue(summary({ totalVns: 1 }));
    vi.mocked(listDumpStatus).mockReturnValue([entry('v5', { dumped_ignored: true })]);

    const html = renderToStaticMarkup(await DumpedPage({
      searchParams: Promise.resolve({ tab: 'ignored' }),
    }));

    expect(html).toContain('data-reset-key="ignored"');
    expect(html).toContain('Visual novel v5');
    expect(html).toContain('ignore:v5:true');
  });

  it('renders missing and complete edition states in their dedicated tabs', async () => {
    vi.mocked(getDumpSummary).mockReturnValue(summary({ totalVns: 2, fullyDumpedVns: 1 }));
    vi.mocked(listDumpStatus).mockReturnValue([
      entry('v1', { total_editions: 2, dumped_editions: 2 }),
      entry('v2', { total_editions: 2, dumped_editions: 1 }),
    ]);

    let html = renderToStaticMarkup(await DumpedPage({
      searchParams: Promise.resolve({ tab: 'complete' }),
    }));
    expect(html).toContain('data-reset-key="complete"');
    expect(html).toContain('Visual novel v1');
    expect(html).toContain('dumped');

    html = renderToStaticMarkup(await DumpedPage({
      searchParams: Promise.resolve({ tab: 'missing' }),
    }));
    expect(html).toContain('data-reset-key="missing"');
    expect(html).toContain('Visual novel v2');
    expect(html).toContain('not dumped');
  });

  it('falls invalid tabs back to all and renders zero-denominator tab percentages', async () => {
    vi.mocked(getDumpSummary).mockReturnValue(summary({ totalVns: 1 }));
    vi.mocked(listDumpStatus).mockReturnValue([entry('v4', { total_editions: 0 })]);

    const html = renderToStaticMarkup(await DumpedPage({
      searchParams: Promise.resolve({ tab: 'unsupported' }),
    }));

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('No VNs in this tab.');
    expect(html).toContain('/ 0%');
    expect(html).not.toContain('data-reset-key=');
  });
});
