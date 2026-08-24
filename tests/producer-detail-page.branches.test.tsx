import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import { use } from 'react';
import ProducerPage from '@/app/producer/[id]/page';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { readScrapedProducerInfo, type ScrapedProducerInfo } from '@/lib/scrape-producer-relations';
import type { ProducerRow } from '@/lib/types';
import type { DetailSection } from '@/components/DetailReorderLayout';

const suspendState = vi.hoisted(() => ({
  promise: null as Promise<void> | null,
  resolve: null as (() => void) | null,
}));

const producerRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  upsert: vi.fn(),
  ownershipSummary: vi.fn(),
}));

const appSettingMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/db/repositories/producer', () => ({
  getProducerRepository: () => producerRepositoryMocks,
}));

vi.mock('@/lib/db/repositories/app-setting', () => ({
  getAppSettingRepository: () => appSettingMocks,
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
  DensityScopeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  ProducerLogoUpload: ({ producerId }: { producerId: string }) => <div data-testid="producer-logo-upload">{producerId}</div>,
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

vi.mock('@/components/ProducerVnsSections', () => ({
  ProducerVnsSections: () => {
    if (!suspendState.promise) {
      suspendState.promise = new Promise<void>((resolve) => {
        suspendState.resolve = resolve;
      });
    }
    use(suspendState.promise);
    return <div data-testid="producer-vns-resolved" />;
  },
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

const scraped: ScrapedProducerInfo = {
  pid: 'p1',
  relations: [{ relation: 'Parent', id: 'p2', name: 'Parent producer' }],
  fetched_at: 1,
};

beforeEach(() => {
  suspendState.promise = null;
  suspendState.resolve = null;
  appSettingMocks.get.mockReset().mockResolvedValue(null);
  producerRepositoryMocks.get.mockReset().mockResolvedValue(producer());
  producerRepositoryMocks.ownershipSummary.mockReset().mockResolvedValue({ ownedIds: new Set(['v1']), sample: null });
  producerRepositoryMocks.upsert.mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchProducer).mockReset().mockResolvedValue(null);
  vi.mocked(readScrapedProducerInfo).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  suspendState.resolve?.();
});

describe('producer detail page branches', () => {
  it('renders the works Suspense skeleton fallback while the works section is pending', async () => {
    const stream = await renderToReadableStream(
      await ProducerPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let shell = '';
    for (let i = 0; i < 50 && !shell.includes('h-16 w-11 shrink-0 rounded bg-bg-elev/60'); i += 1) {
      const { value, done } = await reader.read();
      if (value) shell += decoder.decode(value, { stream: true });
      if (done) break;
    }

    expect(shell).toContain('animate-pulse');
    expect(shell).toContain('--card-density-px, 220px');
    expect(shell).toContain('h-16 w-11 shrink-0 rounded bg-bg-elev/60');
    expect(shell).not.toContain('producer-vns-resolved');

    suspendState.resolve?.();
    reader.releaseLock();
    await stream.allReady;
  });

  it('reuses the loaded scraped relations payload without a second cache read', async () => {
    vi.mocked(readScrapedProducerInfo).mockResolvedValue(scraped);

    const stream = await renderToReadableStream(
      await ProducerPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      }),
    );
    suspendState.resolve?.();
    await stream.allReady;
    const html = await new Response(stream).text();

    expect(html).toContain('data-section="stats"');
    expect(html).toContain('Parent producer');
    expect(readScrapedProducerInfo).toHaveBeenCalledTimes(1);
  });
});
