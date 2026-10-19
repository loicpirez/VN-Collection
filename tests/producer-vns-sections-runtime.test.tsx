import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProducerVnsSections } from '@/components/ProducerVnsSections';
import { fetchProducerAssociations } from '@/lib/producer-associations';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ProducerAssociations, ProducerVnRef } from '@/lib/producer-associations';
import type { CollectionCardItem } from '@/lib/types';

const localCards = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/repositories/collection-list', () => ({ getCollectionListRepository: () => ({ listCards: localCards }) }));

vi.mock('@/components/WorksCacheLoader', () => ({ WorksCacheLoader: ({ needed }: { needed: boolean }) => needed ? <div role="status">Loading credits</div> : null }));

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
  localCards.mockReset().mockResolvedValue([]);
  vi.mocked(fetchProducerAssociations).mockReset().mockResolvedValue(associations());
});

describe('ProducerVnsSections', () => {
  it('keeps local owned works visible when both upstream caches are missing', async () => {
    const base: CollectionCardItem = { id: 'v90991', title: 'Local work', alttitle: null, released: null, rating: null, image_url: null, image_thumb: null, image_sexual: null, local_image: null, local_image_thumb: null, length_minutes: null, developers: [], publishers: [], tags: [], relations: [], custom_cover: null, banner_image: null, banner_position: null, cover_rotation: 0, banner_rotation: 0, fetched_at: 1 };
    localCards.mockResolvedValueOnce([
      base,
      { ...base, id: 'v90992', title: 'Local thumb', local_image_thumb: 'vn/thumb.jpg', image_sexual: 2 },
      { ...base, id: 'v90993', title: 'Local full', local_image: 'vn/full.jpg' },
      { ...base, id: 'v90994', title: 'Remote full', image_url: '/remote.jpg', image_sexual: 0 },
      { ...base, id: 'v90995', title: 'Remote thumb', image_thumb: '/thumb.jpg' },
    ]).mockResolvedValueOnce([base, { ...base, id: 'v90996', title: 'Owned publisher' }]);
    vi.mocked(fetchProducerAssociations).mockResolvedValue(associations({ upstreamFailed: true, developerVns: [missingDev], publisherVns: [publisher] }));
    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90991', scope: 'collection' }));
    for (const title of ['Local work', 'Local thumb', 'Local full', 'Remote full', 'Remote thumb', 'Owned publisher']) expect(html).toContain(title);
    expect(html).not.toContain('Missing developer VN');
    expect(html).not.toContain('>Publisher VN<');
    expect(html).toContain('/api/files/vn/thumb.jpg');
    expect(html).toContain('/api/files/vn/full.jpg');
    expect(localCards.mock.calls).toEqual([[{ producer: 'p90991' }], [{ publisher: 'p90991' }]]);
  });
  it('keeps the page usable when the cache association read fails', async () => {
    vi.mocked(fetchProducerAssociations).mockRejectedValue(new Error('offline'));
    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));
    expect(html).toContain(dictionaries.en.producerVns.heading);
    expect(html).toContain('refresh p90001');
    expect(html).toContain('href="/producer/p90001"');
    expect(html).not.toContain(dictionaries.en.producerVns.developerCredits);
    expect(fetchProducerAssociations).toHaveBeenNthCalledWith(1, 'p90001', { cacheOnly: true });
    expect(fetchProducerAssociations).toHaveBeenCalledTimes(1);
    expect(html).toContain(dictionaries.en.producerVns.staleBadge);
  });

  it('loads producer credits through the read-through cache without a manual refresh', async () => {
    vi.mocked(fetchProducerAssociations)
      .mockResolvedValueOnce(associations({ developerVns: [ownedDev], totalUnique: 1, ownedUnique: 1 }));

    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));

    expect(html).toContain('Owned developer VN');
    expect(html).toContain('refresh p90001');
    expect(html).not.toContain(dictionaries.en.producerVns.staleBadge);
    expect(fetchProducerAssociations).toHaveBeenNthCalledWith(1, 'p90001', { cacheOnly: true });
    expect(fetchProducerAssociations).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable stale state when read-through loading fails', async () => {
    vi.mocked(fetchProducerAssociations)
      .mockRejectedValueOnce(new Error('cache unavailable'));

    const html = renderToStaticMarkup(await ProducerVnsSections({ producerId: 'p90001' }));

    expect(html).not.toContain('Publisher VN');
    expect(html).not.toContain(dictionaries.en.producerVns.publisherCredits);
    expect(html).toContain(dictionaries.en.producerVns.staleBadge);
    expect(fetchProducerAssociations).toHaveBeenCalledTimes(1);
  });

  it('renders developer and publisher cards, stale state, owned chips, and add affordances', async () => {
    vi.mocked(fetchProducerAssociations).mockResolvedValue(associations({
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
