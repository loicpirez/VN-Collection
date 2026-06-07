import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { dictionaries } from '@/lib/i18n/dictionaries';

const overlapMocks = vi.hoisted(() => ({
  findBrandStaffOverlap: vi.fn(),
  isInCollectionMany: vi.fn(),
}));

vi.mock('@/lib/brand-overlap', () => ({
  findBrandStaffOverlap: overlapMocks.findBrandStaffOverlap,
}));

vi.mock('@/lib/db', () => ({
  isInCollectionMany: overlapMocks.isInCollectionMany,
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('@/components/BrandOverlapPicker', () => ({
  BrandOverlapPicker: ({ initialA, initialB }: { initialA: string | null; initialB: string | null }) => (
    <pre data-testid="brand-picker">{JSON.stringify({ initialA, initialB })}</pre>
  ),
}));

import BrandOverlapPage, { generateMetadata } from '@/app/brand-overlap/page';

interface Credit {
  vn_id: string;
  title: string;
  roles: string[];
}

function credit(vnId: string, roles: string[] = []): Credit {
  return { vn_id: vnId, title: `Title ${vnId}`, roles };
}

function result(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    a: { id: 'p1', name: 'Studio A', vnCount: 2 },
    b: { id: 'p2', name: 'Studio B', vnCount: 2 },
    entries: [],
    needsMoreData: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  overlapMocks.findBrandStaffOverlap.mockResolvedValue(result());
  overlapMocks.isInCollectionMany.mockReturnValue(new Set<string>());
});

describe('brand overlap page runtime', () => {
  it('renders metadata and the picker hint when producer ids are missing or invalid', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.brandOverlap.title });
    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'bad', b: undefined, p: 'bad' }),
    }));
    expect(html).toContain(dictionaries.en.brandOverlap.pickHint);
    expect(html).toContain('&quot;initialA&quot;:null');
    expect(html).toContain('&quot;initialB&quot;:null');
    expect(overlapMocks.findBrandStaffOverlap).not.toHaveBeenCalled();
  });

  it('renders the needs-more-data state with producer-name fallbacks', async () => {
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result({
      a: null,
      b: null,
      needsMoreData: true,
    }));
    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'P1', b: 'P2', p: '1' }),
    }));
    expect(html).toContain(dictionaries.en.brandOverlap.needsMoreData);
    expect(html).toContain('href="/producer/p1"');
    expect(html).toContain('href="/producer/p2"');
    expect(html).toContain('p1');
    expect(html).toContain('p2');
  });

  it('renders the zero-result state with producer names', async () => {
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result());
    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'p1', b: 'p2', p: '1' }),
    }));
    expect(html).toContain(dictionaries.en.brandOverlap.empty);
    expect(html).toContain('Studio A');
    expect(html).toContain('Studio B');
  });

  it('renders the zero-result state with producer id fallbacks', async () => {
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result({ a: null, b: null }));
    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'p1', b: 'p2', p: '1' }),
    }));
    expect(html).toContain(dictionaries.en.brandOverlap.empty);
    expect(html).toContain('p1');
    expect(html).toContain('p2');
  });

  it('renders paginated overlap entries with owned markers, role labels, and truncation counts', async () => {
    const entries = Array.from({ length: 22 }, (_value, index) => ({
      sid: `s${index + 1}`,
      name: index === 0 ? 'Shared Staff' : `Staff ${index + 1}`,
      original: index === 0 ? 'Original Name' : null,
      isVa: index === 0,
      aCredits: index === 0
        ? [credit('v1', ['scenario']), credit('v2'), credit('v3'), credit('v4'), credit('v5')]
        : [credit(`v${index + 10}`)],
      bCredits: index === 0
        ? [credit('v6', ['va:Heroine']), credit('v7', ['director']), credit('v8'), credit('v9'), credit('v10')]
        : [credit(`v${index + 40}`)],
    }));
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result({ entries }));
    overlapMocks.isInCollectionMany.mockReturnValue(new Set(['v1', 'v6']));

    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'p1', b: 'p2', p: '2' }),
    }));

    expect(html).toContain('22 matches');
    expect(html).toContain(dictionaries.en.brandOverlap.pageLabel.replace('{current}', '2').replace('{total}', '2'));
    expect(html).toContain('href="/brand-overlap?a=p1&amp;b=p2"');
    expect(html).toContain(dictionaries.en.brandOverlap.nextPage);
    expect(html).toContain('Staff 21');
    expect(html).not.toContain('Shared Staff');
  });

  it('renders first-page credit details and next-page link', async () => {
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result({
      entries: [{
        sid: 's1',
        name: 'Shared Staff',
        original: 'Original Name',
        isVa: true,
        aCredits: [credit('v1', ['scenario']), credit('v2'), credit('v3'), credit('v4'), credit('v5')],
        bCredits: [credit('v6', ['va:Heroine']), credit('v7', ['director']), credit('v8'), credit('v9'), credit('v10')],
      }, ...Array.from({ length: 20 }, (_value, index) => ({
        sid: `s${index + 2}`,
        name: `Staff ${index + 2}`,
        original: null,
        isVa: false,
        aCredits: [credit(`v${index + 20}`)],
        bCredits: [credit(`v${index + 60}`)],
      }))],
    }));
    overlapMocks.isInCollectionMany.mockReturnValue(new Set(['v1', 'v6']));

    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'p1', b: 'p2', p: '1' }),
    }));

    expect(html).toContain('Shared Staff');
    expect(html).toContain('Original Name');
    expect(html).toContain('data-in-collection="true"');
    expect(html).toContain('Scenario');
    expect(html).toContain('Voice: Heroine');
    expect(html).toContain('+1');
    expect(html).toContain('href="/brand-overlap?a=p1&amp;b=p2&amp;p=2"');
  });

  it('renders result headers with producer id fallbacks and bare VA roles', async () => {
    overlapMocks.findBrandStaffOverlap.mockResolvedValue(result({
      a: null,
      b: null,
      entries: [{
        sid: 's1',
        name: 'Shared Actor',
        original: null,
        isVa: true,
        aCredits: [credit('v1', ['va'])],
        bCredits: [credit('v2', ['va'])],
      }],
    }));
    const html = renderToStaticMarkup(await BrandOverlapPage({
      searchParams: Promise.resolve({ a: 'p1', b: 'p2', p: '1' }),
    }));
    expect(html).toContain('p1');
    expect(html).toContain('p2');
    expect(html).toContain(dictionaries.en.characters.castLabel);
  });
});
