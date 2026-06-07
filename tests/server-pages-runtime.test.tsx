import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dbMocks = vi.hoisted(() => ({
  getCacheFreshness: vi.fn(),
  listAllQuotes: vi.fn(),
  listCollectionForCards: vi.fn(),
  listPlaces: vi.fn(),
}));

const headerMocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

const qrMocks = vi.hoisted(() => ({
  toString: vi.fn(),
}));

const tagMocks = vi.hoisted(() => ({
  getVndbTagHomeTree: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getCacheFreshness: dbMocks.getCacheFreshness,
  listAllQuotes: dbMocks.listAllQuotes,
  listCollectionForCards: dbMocks.listCollectionForCards,
  listPlaces: dbMocks.listPlaces,
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('next/headers', () => ({
  headers: headerMocks.headers,
}));

vi.mock('qrcode', () => ({
  toString: qrMocks.toString,
}));

vi.mock('@/lib/vndb-tag-web-cache', () => ({
  getVndbTagHomeTree: tagMocks.getVndbTagHomeTree,
}));

vi.mock('@/components/MapPageClient', () => ({
  MapPageClient: (props: Record<string, unknown>) => <pre data-testid="map-props">{JSON.stringify(props)}</pre>,
}));

vi.mock('@/components/TagsBrowser', () => ({
  TagsBrowser: (props: Record<string, unknown>) => <pre data-testid="tags-props">{JSON.stringify(props)}</pre>,
}));

vi.mock('@/components/QuoteAvatar', () => ({
  QuoteAvatar: ({ quote }: { quote: { quote_id: string } }) => <span data-testid="quote-avatar">{quote.quote_id}</span>,
}));

vi.mock('@/components/PrintButton', () => ({
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

import MapPage, { generateMetadata as generateMapMetadata } from '@/app/map/page';
import TagsPage, { generateMetadata as generateTagsMetadata } from '@/app/tags/page';
import QuotesPage, { generateMetadata as generateQuotesMetadata } from '@/app/quotes/page';
import LabelsPage, { generateMetadata as generateLabelsMetadata } from '@/app/labels/page';

function headerMap(values: Record<string, string | null>): Headers {
  const h = new Headers();
  for (const [key, value] of Object.entries(values)) {
    if (value != null) h.set(key, value);
  }
  return h;
}

function quoteRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vn_id: 'v1',
    vn_title: 'VN One',
    quote_id: 'q1',
    quote: 'Quote one',
    score: 7,
    character_id: 'c1',
    character_name: 'Heroine',
    character_local_image: null,
    vn_image_url: null,
    vn_local_image: null,
    vn_local_image_thumb: null,
    ...overrides,
  };
}

function cardRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Title ${id}`,
    physical_location: [],
    status: 'owned',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getCacheFreshness.mockReturnValue(null);
  dbMocks.listAllQuotes.mockReturnValue([]);
  dbMocks.listCollectionForCards.mockReturnValue([]);
  dbMocks.listPlaces.mockReturnValue([{ id: 1, name: 'Place One', lat: 35, lng: 139 }]);
  headerMocks.headers.mockResolvedValue(headerMap({ host: 'localhost:3000' }));
  qrMocks.toString.mockResolvedValue('<svg><path /></svg>');
  tagMocks.getVndbTagHomeTree.mockResolvedValue({ data: { groups: [{ id: 'content', label: 'Content', tags: [] }] } });
});

describe('map page runtime', () => {
  it('renders metadata and finite focus props from search params', async () => {
    expect(await generateMapMetadata()).toEqual({ title: dictionaries.en.map.title });
    const html = renderToStaticMarkup(await MapPage({
      searchParams: Promise.resolve({ lat: '35.1', lng: '139.2', place: '5' }),
    }));
    expect(html).toContain('&quot;focusLat&quot;:35.1');
    expect(html).toContain('&quot;focusLng&quot;:139.2');
    expect(html).toContain('&quot;focusId&quot;:5');
  });

  it('normalizes missing and invalid focus search params to null', async () => {
    const html = renderToStaticMarkup(await MapPage({
      searchParams: Promise.resolve({ lat: 'bad', lng: '139.2', id: '-1' }),
    }));
    expect(html).toContain('&quot;focusLat&quot;:null');
    expect(html).toContain('&quot;focusLng&quot;:null');
    expect(html).toContain('&quot;focusId&quot;:null');
  });

  it('renders null focus props when no focus search params are supplied', async () => {
    const html = renderToStaticMarkup(await MapPage({
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('&quot;focusLat&quot;:null');
    expect(html).toContain('&quot;focusLng&quot;:null');
    expect(html).toContain('&quot;focusId&quot;:null');
  });
});

describe('tags page runtime', () => {
  it('passes cache freshness, VNDB mode, and prefetched tree to the client', async () => {
    dbMocks.getCacheFreshness.mockReturnValue(123);
    expect(await generateTagsMetadata()).toEqual({ title: dictionaries.en.nav.tags });
    const html = renderToStaticMarkup(await TagsPage({
      searchParams: Promise.resolve({ mode: 'vndb' }),
    }));
    expect(html).toContain('&quot;lastUpdatedAt&quot;:123');
    expect(html).toContain('&quot;initialMode&quot;:&quot;vndb&quot;');
    expect(html).toContain('&quot;groups&quot;');
  });

  it('falls back to a null initial tree when VNDB tag scraping fails or returns no data', async () => {
    tagMocks.getVndbTagHomeTree.mockResolvedValueOnce({});
    let html = renderToStaticMarkup(await TagsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('&quot;initialTree&quot;:null');

    tagMocks.getVndbTagHomeTree.mockRejectedValueOnce(new Error('scrape failed'));
    html = renderToStaticMarkup(await TagsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('&quot;initialTree&quot;:null');
  });
});

describe('quotes page runtime', () => {
  it('renders metadata and the empty state for an empty result set', async () => {
    expect(await generateQuotesMetadata()).toEqual({ title: dictionaries.en.nav.quotes });
    const html = renderToStaticMarkup(await QuotesPage({
      searchParams: Promise.resolve({ q: '', page: 'bad' }),
    }));
    expect(html).toContain(dictionaries.en.quotesPage.empty);
    expect(dbMocks.listAllQuotes).toHaveBeenCalledWith('', 51, 0);
  });

  it('renders search pagination links with q and page params', async () => {
    dbMocks.listAllQuotes.mockReturnValue(Array.from({ length: 51 }, (_value, index) => quoteRow({
      vn_id: `v${index + 1}`,
      quote_id: `q${index + 1}`,
    })));
    const html = renderToStaticMarkup(await QuotesPage({
      searchParams: Promise.resolve({ q: 'hero', page: '2' }),
    }));
    expect(html).toContain('href="/quotes?q=hero"');
    expect(html).toContain('href="/quotes?q=hero&amp;page=3"');
    expect(html).toContain(dictionaries.en.quotesPage.pageIndicator.replace('{page}', '2'));
  });

  it('renders page-one next pagination without search params', async () => {
    dbMocks.listAllQuotes.mockReturnValue(Array.from({ length: 51 }, (_value, index) => quoteRow({
      vn_id: `v${index + 1}`,
      quote_id: `q${index + 1}`,
    })));
    const html = renderToStaticMarkup(await QuotesPage({
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('href="/quotes?page=2"');
    expect(html).not.toContain(dictionaries.en.quotesPage.prevPage);
  });

  it('renders previous-only pagination on later pages without a next page', async () => {
    dbMocks.listAllQuotes.mockReturnValue([quoteRow()]);
    const html = renderToStaticMarkup(await QuotesPage({
      searchParams: Promise.resolve({ page: '2' }),
    }));
    expect(html).toContain('href="/quotes"');
    expect(html).toContain(dictionaries.en.quotesPage.prevPage);
    expect(html).not.toContain(dictionaries.en.quotesPage.nextPage);
  });

  it('renders character-name-only citations and page-one next links without a query', async () => {
    dbMocks.listAllQuotes.mockReturnValue([quoteRow({ character_id: null, character_name: 'Narrator' }), quoteRow({ character_name: null })]);
    const html = renderToStaticMarkup(await QuotesPage({
      searchParams: Promise.resolve({ page: '1' }),
    }));
    expect(html).toContain('Narrator');
    expect(html).not.toContain('href="/character/');
    expect(html).not.toContain(dictionaries.en.quotesPage.prevPage);
  });
});

describe('labels page runtime', () => {
  it('renders metadata and invalid-id feedback', async () => {
    expect(await generateLabelsMetadata()).toEqual({ title: dictionaries.en.labels.title });
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: 'bad', status: undefined }),
    }));
    expect(html).toContain(dictionaries.en.labels.invalidIds);
    expect(dbMocks.listCollectionForCards).not.toHaveBeenCalled();
  });

  it('renders the empty state when no labels match', async () => {
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: '', status: 'owned' }),
    }));
    expect(html).toContain(dictionaries.en.labels.empty);
    expect(dbMocks.listCollectionForCards).toHaveBeenCalledWith({ sort: 'title', vnIds: undefined });
  });

  it('treats comma-only id filters as an unfiltered request', async () => {
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: ', ,', status: undefined }),
    }));
    expect(html).toContain(dictionaries.en.labels.empty);
    expect(dbMocks.listCollectionForCards).toHaveBeenCalledWith({ sort: 'title', vnIds: undefined });
  });

  it('generates QR labels, applies id/status filters, and shows truncation', async () => {
    dbMocks.listCollectionForCards.mockReturnValue(Array.from({ length: 201 }, (_value, index) => cardRow(`v${index + 1}`, {
      status: 'owned',
      physical_location: index === 0 ? ['shelf'] : [],
    })));
    headerMocks.headers.mockResolvedValue(headerMap({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'example.test',
      host: 'localhost:3000',
    }));
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: Array.from({ length: 501 }, (_value, index) => `v${index + 1}`).join(','), status: 'owned' }),
    }));
    expect(html).toContain(dictionaries.en.labels.truncated.replace('{shown}', '200').replace('{total}', '201'));
    expect(html).toContain('shelf');
    expect(qrMocks.toString).toHaveBeenCalledWith('https://example.test/vn/v1', expect.any(Object));
    const firstArg = dbMocks.listCollectionForCards.mock.calls[0]?.[0] as { vnIds?: string[] };
    expect(firstArg.vnIds).toHaveLength(500);
  });

  it('falls back to a local SVG error marker when QR generation fails', async () => {
    dbMocks.listCollectionForCards.mockReturnValue([cardRow('v1')]);
    qrMocks.toString.mockRejectedValue(new Error('qr failed'));
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: 'v1', status: undefined }),
    }));
    expect(html).toContain('<text x="2" y="14" font-size="6" fill="#cc0000">');
  });

  it('renders labels when physical_location is absent', async () => {
    dbMocks.listCollectionForCards.mockReturnValue([cardRow('v1', { physical_location: null })]);
    const html = renderToStaticMarkup(await LabelsPage({
      searchParams: Promise.resolve({ ids: 'v1', status: undefined }),
    }));
    expect(html).toContain('Title v1');
    expect(html).not.toContain(' / ');
  });
});
