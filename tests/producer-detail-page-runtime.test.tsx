import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProducerPage, { generateMetadata as generateProducerMetadata } from '@/app/producer/[id]/page';
import { getAppSetting, getProducer as getProducerLocal, producerOwnershipSummary, upsertProducer } from '@/lib/db';
import { getProducer as fetchProducer, type VndbProducer } from '@/lib/vndb';
import { readScrapedProducerInfo, type ScrapedProducerInfo } from '@/lib/scrape-producer-relations';
import type { ProducerRow } from '@/lib/types';
import type { DetailSection } from '@/components/DetailReorderLayout';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db', () => ({
  getAppSetting: vi.fn(),
  getProducer: vi.fn(),
  producerOwnershipSummary: vi.fn(),
  upsertProducer: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getProducer: vi.fn(),
}));

vi.mock('@/lib/scrape-producer-relations', () => ({
  readScrapedProducerInfo: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => (await import('@/lib/i18n/dictionaries')).dictionaries.en),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/DetailReorderLayout', () => ({
  DetailReorderLayout: ({ sections }: { sections: DetailSection[] }) => (
    <div data-testid="detail-layout">
      {sections.map((section) => <section key={section.id} data-section={section.id}>{section.node}</section>)}
    </div>
  ),
}));

vi.mock('@/components/ProducerLogo', () => ({
  ProducerLogo: ({ producer }: { producer: ProducerRow }) => <div data-testid="producer-logo">{producer.name}</div>,
}));

vi.mock('@/components/ProducerLogoUpload', () => ({
  ProducerLogoUpload: ({ producerId, hasLogo }: { producerId: string; hasLogo: boolean }) => (
    <div data-testid="producer-logo-upload">{producerId}:{String(hasLogo)}</div>
  ),
}));

vi.mock('@/components/ProducerVnsSections', () => ({
  ProducerVnsSections: ({ producerId, scope }: { producerId: string; scope: string }) => (
    <div data-testid="producer-vns">{producerId}:{scope}</div>
  ),
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

function producer(overrides: Partial<ProducerRow> = {}): ProducerRow {
  return {
    id: 'p1',
    name: 'Producer',
    original: null,
    lang: null,
    type: null,
    description: null,
    aliases: [],
    extlinks: [],
    logo_path: null,
    fetched_at: Date.now(),
    ...overrides,
  };
}

function upstreamProducer(overrides: Partial<VndbProducer> = {}): VndbProducer {
  return {
    id: 'p1',
    name: 'Upstream producer',
    original: null,
    aliases: [],
    lang: null,
    type: null,
    description: null,
    extlinks: [],
    ...overrides,
  };
}

const scraped: ScrapedProducerInfo = {
  pid: 'p1',
  relations: [{ relation: 'Parent', id: 'p2', name: 'Parent producer' }],
  fetched_at: 1,
};

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(getProducerLocal).mockReset().mockReturnValue(null);
  vi.mocked(producerOwnershipSummary).mockReset().mockReturnValue({ ownedIds: new Set(), sample: null });
  vi.mocked(upsertProducer).mockReset();
  vi.mocked(fetchProducer).mockReset().mockResolvedValue(null);
  vi.mocked(readScrapedProducerInfo).mockReset().mockReturnValue(null);
});

describe('producer detail page runtime', () => {
  it('renders local metadata or an empty metadata object', async () => {
    expect(await generateProducerMetadata({ params: Promise.resolve({ id: 'p1' }) })).toEqual({});

    vi.mocked(getProducerLocal).mockReturnValueOnce(producer());
    expect(await generateProducerMetadata({ params: Promise.resolve({ id: 'p1' }) })).toEqual({ title: 'Producer' });
  });

  it('rejects malformed ids and unknown producers without owned credits', async () => {
    await expect(ProducerPage({ params: Promise.resolve({ id: 'bad' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
    await expect(ProducerPage({ params: Promise.resolve({ id: 'p404' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
  });

  it('uses fresh local cache without requesting VNDB', async () => {
    vi.mocked(getProducerLocal).mockReturnValue(producer());

    const html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Producer');
    expect(fetchProducer).not.toHaveBeenCalled();
    expect(html).toContain('data-section="stats"');
  });

  it('serves stale cache when VNDB returns no row or rejects', async () => {
    const stale = producer({ fetched_at: 1 });
    vi.mocked(getProducerLocal).mockReturnValue(stale);

    let html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('Producer');

    vi.mocked(fetchProducer).mockRejectedValueOnce(new Error('offline'));
    html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('Producer');
  });

  it('upserts a fetched producer and reads back its mirrored row', async () => {
    vi.mocked(fetchProducer).mockResolvedValueOnce(upstreamProducer());
    vi.mocked(getProducerLocal).mockReturnValueOnce(null).mockReturnValueOnce(producer({ name: 'Mirrored producer' }));

    const html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(upsertProducer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Upstream producer' }));
    expect(html).toContain('Mirrored producer');
  });

  it('builds collection-sample fallbacks from developer, publisher, or id data', async () => {
    vi.mocked(producerOwnershipSummary).mockReturnValueOnce({
      ownedIds: new Set(['v1']),
      sample: { developers: [{ id: 'p1', name: 'Developer sample' }], publishers: [] },
    });
    let html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('Developer sample');

    vi.mocked(producerOwnershipSummary).mockReturnValueOnce({
      ownedIds: new Set(['v1']),
      sample: { developers: [], publishers: [{ id: 'p1', name: 'Publisher sample' }] },
    });
    html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('Publisher sample');

    vi.mocked(producerOwnershipSummary).mockReturnValueOnce({ ownedIds: new Set(['v1']), sample: null });
    html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain('>p1</h1>');
  });

  it('renders rich metadata, safe links, collection scope, logo state, and scraped relations', async () => {
    vi.mocked(getProducerLocal).mockReturnValue(producer({
      original: 'Original',
      lang: 'ja',
      type: 'co',
      description: 'Description',
      aliases: ['Alias'],
      extlinks: [
        { url: 'https://example.test/path', label: 'Website', name: 'website' },
        { url: 'javascript:alert(1)', label: 'Unsafe', name: 'unsafe' },
      ],
      logo_path: '/producer/logo.jpg',
    }));
    vi.mocked(producerOwnershipSummary).mockReturnValue({ ownedIds: new Set(['v1']), sample: null });
    vi.mocked(readScrapedProducerInfo).mockReturnValue(scraped);

    const html = renderToStaticMarkup(await ProducerPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({ scope: ['collection', 'all'] }),
    }));

    expect(html).toContain('Original');
    expect(html).toContain('Alias');
    expect(html).toContain('Description');
    expect(html).toContain('JA');
    expect(html).toContain('href="https://example.test/path"');
    expect(html).not.toContain('Unsafe');
    expect(html).toContain('data-testid="producer-vns">p1:collection');
    expect(html).toContain('data-testid="producer-logo-upload">p1:true');
    expect(html).toContain('data-section="description"');
    expect(html).toContain('Parent producer');
    expect(html).toContain('href="/producer/p2"');
  });
});
