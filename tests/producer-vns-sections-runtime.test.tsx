import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProducerVnsSections } from '@/components/ProducerVnsSections';
import { fetchProducerAssociations } from '@/lib/producer-associations';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ProducerAssociations, ProducerVnRef } from '@/lib/producer-associations';

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/lib/producer-associations', () => ({
  fetchProducerAssociations: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, src }: { alt: string; src: string | null }) => <img alt={alt} src={src ?? ''} />,
}));

vi.mock('@/components/AddMissingVnButton', () => ({
  AddMissingVnButton: ({ vnId }: { vnId: string }) => <button type="button">add {vnId}</button>,
}));

vi.mock('@/components/ProducerRefreshButton', () => ({
  ProducerRefreshButton: ({ producerId }: { producerId: string }) => <button type="button">refresh {producerId}</button>,
}));

vi.mock('@/components/PaginatedGrid', () => ({
  PaginatedGrid: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
}));

const ownedDev: ProducerVnRef = {
  id: 'v90001',
  title: 'Owned developer VN',
  alttitle: 'Native title',
  released: '2026-01-01',
  rating: 80,
  image: { url: '/full.jpg', thumbnail: '/thumb.jpg', sexual: 0 },
  owned: true,
};

const missingDev: ProducerVnRef = {
  id: 'v90002',
  title: 'Missing developer VN',
  alttitle: null,
  released: null,
  rating: null,
  image: null,
  owned: false,
};

const publisher: ProducerVnRef = {
  id: 'v90003',
  title: 'Publisher VN',
  alttitle: 'Publisher VN',
  released: '2025-02-03',
  rating: 65,
  image: { url: '/publisher.jpg', thumbnail: '', sexual: 1 },
  owned: false,
};

function associations(overrides: Partial<ProducerAssociations> = {}): ProducerAssociations {
  return {
    name: 'Producer',
    developerVns: [],
    publisherVns: [],
    totalUnique: 0,
    ownedUnique: 0,
    fromCache: false,
    upstreamFailed: false,
    stale: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchProducerAssociations).mockReset().mockResolvedValue(associations());
});

describe('ProducerVnsSections', () => {
  it('keeps the page usable when the upstream association fetch fails', async () => {
    vi.mocked(fetchProducerAssociations).mockRejectedValueOnce(new Error('offline'));
    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));
    expect(html).toContain(dictionaries.en.producerVns.heading);
    expect(html).toContain('refresh p90001');
    expect(html).toContain('href="/producer/p90001"');
    expect(html).not.toContain(dictionaries.en.producerVns.developerCredits);
  });

  it('renders developer and publisher cards, stale state, owned chips, and add affordances', async () => {
    vi.mocked(fetchProducerAssociations).mockResolvedValueOnce(associations({
      developerVns: [ownedDev, missingDev],
      publisherVns: [publisher],
      totalUnique: 3,
      ownedUnique: 1,
      stale: true,
    }));
    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));
    expect(html).toContain(dictionaries.en.producerVns.staleBadge);
    expect(html).toContain(dictionaries.en.producerVns.developerCredits);
    expect(html).toContain(dictionaries.en.producerVns.publisherCredits);
    expect(html).toContain('Owned developer VN');
    expect(html).toContain('Native title');
    expect(html).toContain('add v90002');
    expect(html).toContain('add v90003');
    expect(html).toContain('/thumb.jpg');
    expect(html).toContain('/publisher.jpg');
  });

  it('filters collection scope to owned rows', async () => {
    vi.mocked(fetchProducerAssociations).mockResolvedValueOnce(associations({
      developerVns: [ownedDev, missingDev],
      publisherVns: [publisher],
      totalUnique: 3,
      ownedUnique: 1,
    }));
    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001', scope: 'collection' }));
    expect(html).toContain('Owned developer VN');
    expect(html).not.toContain('Missing developer VN');
    expect(html).not.toContain('Publisher VN');
    expect(html).toContain('aria-current="page"');
  });

  it('renders a collection-scope empty state and publisher-only sections', async () => {
    vi.mocked(fetchProducerAssociations).mockResolvedValueOnce(associations({
      publisherVns: [publisher],
      totalUnique: 1,
    }));
    let html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001', scope: 'collection' }));
    expect(html).toContain(dictionaries.en.producerVns.collectionEmpty);
    expect(html).not.toContain(dictionaries.en.producerVns.publisherCredits);

    vi.mocked(fetchProducerAssociations).mockResolvedValueOnce(associations({
      publisherVns: [publisher],
      totalUnique: 1,
    }));
    html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));
    expect(html).not.toContain(dictionaries.en.producerVns.developerCredits);
    expect(html).toContain(dictionaries.en.producerVns.publisherCredits);
  });
});
