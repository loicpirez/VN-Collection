import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import BrandOverlapPage, { generateMetadata as generateBrandOverlapMetadata } from '@/app/brand-overlap/page';
import ProducersPage, { generateMetadata as generateProducersMetadata } from '@/app/producers/page';
import QuotesPage, { generateMetadata as generateQuotesMetadata } from '@/app/quotes/page';
import { findBrandStaffOverlap, type BrandOverlapEntry, type BrandOverlapResult } from '@/lib/brand-overlap';
import { isInCollectionMany, listAllQuotes, type QuoteWithVn } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ProducerStat } from '@/lib/types';
import { listProducerStats, listPublisherStats } from '@/lib/db';

vi.mock('@/lib/brand-overlap', () => ({
  findBrandStaffOverlap: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  isInCollectionMany: vi.fn(),
  listAllQuotes: vi.fn(),
  listProducerStats: vi.fn(),
  listPublisherStats: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/BrandOverlapPicker', () => ({
  BrandOverlapPicker: ({ initialA, initialB }: { initialA: string | null; initialB: string | null }) => (
    <div data-testid="brand-picker">{initialA ?? 'none'}:{initialB ?? 'none'}</div>
  ),
}));

vi.mock('@/components/ProducerLogo', () => ({
  ProducerLogo: ({ producer }: { producer: ProducerStat }) => <span data-testid="producer-logo">{producer.id}</span>,
}));

vi.mock('@/components/QuoteAvatar', () => ({
  QuoteAvatar: ({ quote }: { quote: QuoteWithVn }) => <span data-testid="quote-avatar">{quote.quote_id}</span>,
}));

function producer(id: string, name: string, overrides: Partial<ProducerStat> = {}): ProducerStat {
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
    vn_count: 1,
    avg_user_rating: null,
    avg_rating: null,
    ...overrides,
  };
}

function quote(id: number, overrides: Partial<QuoteWithVn> = {}): QuoteWithVn {
  return {
    quote_id: `q${id}`,
    vn_id: `v${id}`,
    vn_title: `VN ${id}`,
    quote: `Quote ${id}`,
    score: id,
    character_id: null,
    character_name: null,
    character_local_image: null,
    vn_image_url: null,
    vn_local_image: null,
    vn_local_image_thumb: null,
    ...overrides,
  };
}

function overlapEntry(id: number, overrides: Partial<BrandOverlapEntry> = {}): BrandOverlapEntry {
  return {
    sid: `s${id}`,
    name: `Staff ${id}`,
    original: null,
    isVa: false,
    aCredits: [{ vn_id: `v${id}`, title: `A ${id}`, roles: [] }],
    bCredits: [{ vn_id: `v${id + 100}`, title: `B ${id}`, roles: [] }],
    ...overrides,
  };
}

function overlap(overrides: Partial<BrandOverlapResult> = {}): BrandOverlapResult {
  return {
    a: { id: 'p1', name: 'Brand A', vnCount: 1 },
    b: { id: 'p2', name: 'Brand B', vnCount: 1 },
    entries: [],
    needsMoreData: false,
    ...overrides,
  };
}

async function renderBrand(params: { a?: string; b?: string; p?: string }): Promise<string> {
  const stream = await renderToReadableStream(await BrandOverlapPage({ searchParams: Promise.resolve(params) }));
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  vi.mocked(findBrandStaffOverlap).mockReset().mockResolvedValue(overlap());
  vi.mocked(isInCollectionMany).mockReset().mockReturnValue(new Set());
  vi.mocked(listAllQuotes).mockReset().mockReturnValue([]);
  vi.mocked(listProducerStats).mockReset().mockReturnValue([]);
  vi.mocked(listPublisherStats).mockReset().mockReturnValue([]);
});

describe('producer ranking page runtime', () => {
  it('renders metadata and both role-specific empty states', async () => {
    expect(await generateProducersMetadata()).toEqual({ title: dictionaries.en.nav.producers });

    let html = renderToStaticMarkup(await ProducersPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain(dictionaries.en.producers.emptyDeveloper);
    expect(html).not.toContain(dictionaries.en.producers.emptyPublisherHint);

    html = renderToStaticMarkup(await ProducersPage({ searchParams: Promise.resolve({ role: 'publisher' }) }));
    expect(html).toContain(dictionaries.en.producers.emptyPublisher);
    expect(html).toContain(dictionaries.en.producers.emptyPublisherHint.replaceAll('"', '&quot;'));
  });

  it('renders developer rankings across mobile and desktop rows with rank and rating variants', async () => {
    vi.mocked(listProducerStats).mockReturnValue([
      producer('p1', 'First', { original: 'Original first', vn_count: 4, avg_user_rating: 85, avg_rating: 77 }),
      producer('p2', 'Second', { vn_count: 3 }),
      producer('p3', 'Third', { vn_count: 2 }),
      producer('p4', 'Fourth', { vn_count: 1 }),
    ]);

    const html = renderToStaticMarkup(await ProducersPage({ searchParams: Promise.resolve({ role: 'invalid' }) }));

    expect(html).toContain(dictionaries.en.producers.rankingDeveloper);
    expect(html).toContain('aria-label="Developers"');
    expect(html).toContain('Original first');
    expect(html).toContain('8.5');
    expect(html).toContain('7.7');
    expect(html).toContain('data-testid="producer-logo"');
    expect(html).toContain('>4</span>');
  });

  it('renders publisher rankings with the publisher table label', async () => {
    vi.mocked(listPublisherStats).mockReturnValue([producer('p9', 'Publisher')]);

    const html = renderToStaticMarkup(await ProducersPage({ searchParams: Promise.resolve({ role: 'publisher' }) }));

    expect(html).toContain(dictionaries.en.producers.rankingPublisher);
    expect(html).toContain('aria-label="Publishers"');
    expect(html).toContain('Publisher');
  });
});

describe('quotes page runtime', () => {
  it('renders metadata and the empty state with normalized first-page input', async () => {
    expect(await generateQuotesMetadata()).toEqual({ title: dictionaries.en.nav.quotes });

    const html = renderToStaticMarkup(await QuotesPage({ searchParams: Promise.resolve({ page: 'invalid' }) }));

    expect(html).toContain(dictionaries.en.quotesPage.empty);
    expect(listAllQuotes).toHaveBeenCalledWith(undefined, 51, 0);
  });

  it('renders quote attribution variants and next pagination preserving a query', async () => {
    vi.mocked(listAllQuotes).mockReturnValue([
      quote(1, { character_id: 'c1', character_name: 'Linked character' }),
      quote(2, { character_name: 'Plain character' }),
      quote(3),
      ...Array.from({ length: 48 }, (_, index) => quote(index + 4)),
    ]);

    const html = renderToStaticMarkup(await QuotesPage({ searchParams: Promise.resolve({ q: 'needle', page: '-2' }) }));

    expect(html).toContain('href="/character/c1"');
    expect(html).toContain('Linked character');
    expect(html).toContain('Plain character');
    expect(html).toContain('href="/quotes?q=needle&amp;page=2"');
    expect(listAllQuotes).toHaveBeenCalledWith('needle', 51, 0);
  });

  it('renders previous-only pagination on a later final page', async () => {
    vi.mocked(listAllQuotes).mockReturnValue([quote(1)]);

    const html = renderToStaticMarkup(await QuotesPage({ searchParams: Promise.resolve({ q: 'needle', page: '2' }) }));

    expect(html).toContain('href="/quotes?q=needle"');
    expect(html).not.toContain('href="/quotes?q=needle&amp;page=3"');
    expect(listAllQuotes).toHaveBeenCalledWith('needle', 51, 50);
  });
});

describe('brand overlap page runtime', () => {
  it('renders metadata and normalizes missing or invalid producer ids before lookup', async () => {
    expect(await generateBrandOverlapMetadata()).toEqual({ title: dictionaries.en.brandOverlap.title });

    const html = await renderBrand({ a: 'bad', b: 'P2', p: 'invalid' });

    expect(html).toContain('data-testid="brand-picker"');
    expect(html).toContain('none<!-- -->:<!-- -->p2');
    expect(html).toContain(dictionaries.en.brandOverlap.pickHint);
    expect(findBrandStaffOverlap).not.toHaveBeenCalled();
  });

  it('renders the insufficient-data state with producer fallbacks', async () => {
    vi.mocked(findBrandStaffOverlap).mockResolvedValue(overlap({
      a: null,
      b: null,
      needsMoreData: true,
    }));

    const html = await renderBrand({ a: 'P1', b: 'p2' });

    expect(html).toContain(dictionaries.en.brandOverlap.needsMoreData);
    expect(html).toContain('href="/producer/p1"');
    expect(html).toContain('href="/producer/p2"');
  });

  it('renders overlap entries, role variants, owned links, truncated credits, and next pagination', async () => {
    vi.mocked(isInCollectionMany).mockReturnValue(new Set(['v1']));
    vi.mocked(findBrandStaffOverlap).mockResolvedValue(overlap({
      entries: [
        overlapEntry(1, {
          original: 'Original staff',
          isVa: true,
          aCredits: [
            { vn_id: 'v1', title: 'Owned', roles: ['scenario', 'va', 'va:Hero'] },
            ...Array.from({ length: 4 }, (_, index) => ({ vn_id: `v${index + 2}`, title: `A extra ${index}`, roles: [] })),
          ],
          bCredits: [
            ...Array.from({ length: 5 }, (_, index) => ({ vn_id: `v${index + 101}`, title: `B extra ${index}`, roles: [] })),
          ],
        }),
        ...Array.from({ length: 20 }, (_, index) => overlapEntry(index + 2)),
      ],
    }));

    const html = await renderBrand({ a: 'p1', b: 'p2' });

    expect(html).toContain('Original staff');
    expect(html).toContain('data-in-collection="true"');
    expect(html).toContain(dictionaries.en.staff.role_scenario);
    expect(html).toContain(dictionaries.en.characters.castLabel);
    expect(html).toContain(`${dictionaries.en.characters.castLabel}: Hero`);
    expect(html).toContain('>+<!-- -->1</li>');
    expect(html).toContain('href="/brand-overlap?a=p1&amp;b=p2&amp;p=2"');
  });

  it('renders the empty overlap state and clamped final pagination page', async () => {
    let html = await renderBrand({ a: 'p1', b: 'p2' });
    expect(html).toContain(dictionaries.en.brandOverlap.empty);

    vi.mocked(findBrandStaffOverlap).mockResolvedValue(overlap({
      entries: Array.from({ length: 21 }, (_, index) => overlapEntry(index + 1)),
    }));
    html = await renderBrand({ a: 'p1', b: 'p2', p: '99' });
    expect(html).toContain(dictionaries.en.brandOverlap.pageLabel.replace('{current}', '2').replace('{total}', '2'));
    expect(html).toContain('href="/brand-overlap?a=p1&amp;b=p2"');
  });
});
