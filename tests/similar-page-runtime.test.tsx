import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SimilarPage, { generateMetadata as generateSimilarMetadata } from '@/app/similar/page';
import { getCollectionItem } from '@/lib/db';
import { vndbAdvancedSearchRaw, type RecHit } from '@/lib/vndb-recommend';
import type { CollectionItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({
  getCollectionItem: vi.fn(),
}));

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(),
}));

vi.mock('@/lib/recommend', () => ({
  applyGenericPenalty: vi.fn((tagId: string, weight: number) => tagId === 'g1' ? weight * 0.1 : weight),
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

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({
    alt,
    src,
  }: {
    alt: string;
    src?: string | null;
  }) => <img alt={alt} src={src ?? undefined} />,
}));

vi.mock('@/components/SeedTagControls', () => ({
  SeedTagControls: ({
    hint,
    initial,
  }: {
    hint: string;
    initial: Array<{ id: string; name: string }>;
  }) => <div data-testid="seed-tags">{hint}:{initial.map((tag) => `${tag.id}=${tag.name}`).join(',')}</div>,
}));

vi.mock('@/components/SimilarSeedPicker', () => ({
  SimilarSeedPicker: ({
    autoFocus,
    currentSeed,
  }: {
    autoFocus?: boolean;
    currentSeed?: { id: string; image: { url: string } | null };
  }) => <div data-testid="seed-picker">{String(autoFocus)}:{currentSeed?.id ?? ''}:{currentSeed?.image?.url ?? ''}</div>,
}));

function collectionItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: 'v1',
    title: 'Seed visual novel',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: [],
    platforms: [],
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    release_images: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    relations: [],
    aliases: [],
    extlinks: [],
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: [],
    editions: [],
    staff: [],
    va: [],
    fetched_at: 1,
    ...overrides,
  };
}

function hit(id: string, overrides: Partial<RecHit> = {}): RecHit {
  return {
    id,
    title: `Recommendation ${id}`,
    alttitle: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    image: null,
    developers: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getCollectionItem).mockReset().mockReturnValue(null);
  vi.mocked(vndbAdvancedSearchRaw).mockReset().mockResolvedValue([]);
});

describe('similar VN page runtime', () => {
  it('generates base or seed-specific metadata', async () => {
    expect(await generateSimilarMetadata({ searchParams: Promise.resolve({}) })).toEqual({ title: 'Similar' });
    expect(await generateSimilarMetadata({ searchParams: Promise.resolve({ vn: 'bad' }) })).toEqual({ title: 'Similar' });
    expect(await generateSimilarMetadata({ searchParams: Promise.resolve({ vn: 'v404' }) })).toEqual({ title: 'Similar' });

    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem());
    expect(await generateSimilarMetadata({ searchParams: Promise.resolve({ vn: 'V1' }) })).toEqual({ title: 'Similar: Seed visual novel' });
    expect(getCollectionItem).toHaveBeenCalledWith('v1');
  });

  it('renders the seed picker landing state and the missing-seed notice', async () => {
    let html = renderToStaticMarkup(await SimilarPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-testid="seed-picker">true::');

    html = renderToStaticMarkup(await SimilarPage({ searchParams: Promise.resolve({ vn: 'v404' }) }));
    expect(html).toContain('VN not found');
  });

  it('derives auto seeds, reports per-tag failures, and renders the empty result state', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      local_image: 'local/seed.jpg',
      tags: [
        { id: 'g1', name: 'Generic', rating: 9, spoiler: 0 },
        { id: 'g2', name: 'Distinctive', rating: 4, spoiler: 0 },
        { id: 'g3', name: 'Spoiler', rating: 8, spoiler: 1 },
        { id: 'g4', name: 'Adult', rating: 8, spoiler: 0, category: 'ero' },
      ],
    }));
    vi.mocked(vndbAdvancedSearchRaw)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1' }),
    }));

    expect(html).toContain('data-testid="seed-picker">undefined:v1:/api/files/local/seed.jpg');
    expect(html).toContain('g2=Distinctive,g1=Generic');
    expect(html).not.toContain('g3=Spoiler');
    expect(html).not.toContain('g4=Adult');
    expect(html).toContain('Some searches failed (Generic).');
    expect(html).toContain('No similar VNs found.');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('aggregates duplicate custom-seed hits, falls back to id labels, and renders result metadata', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      local_image_thumb: 'local/thumb.jpg',
      image_sexual: 1,
      tags: [
        { id: 'g1', name: 'One', rating: 2, spoiler: 0 },
        { id: 'g2', name: 'Two', rating: 3, spoiler: 0 },
        { id: 'g3', name: 'Three', rating: 4, spoiler: 0 },
        { id: 'g4', name: 'Four', rating: 5, spoiler: 0 },
      ],
    }));
    vi.mocked(vndbAdvancedSearchRaw).mockResolvedValue([
      hit('v2', {
        title: 'Rich recommendation',
        released: '2023-01-01',
        rating: 82,
        image: { url: 'https://example.test/full.jpg', thumbnail: 'https://example.test/thumb.jpg', sexual: 1 },
        developers: [{ id: 'p1', name: 'Developer' }],
      }),
    ]);

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1', tags: 'g5,g5,g1,g1,g2,bad,g3,g4' }),
    }));

    expect(html).toContain('data-testid="seed-picker">undefined:v1:/api/files/local/thumb.jpg');
    expect(html).toContain('g5=g5');
    expect(html).not.toContain('bad=bad');
    expect(html).toContain('Rich recommendation');
    expect(html).toContain('Developer');
    expect(html).toContain('8.2');
    expect(html).toContain('2023');
    expect(html).toContain('https://example.test/thumb.jpg');
    expect(html).toContain('Matched tags:');
    expect(html).toContain('+1');
  });

  it('caps result cards at 24 and renders sparse card fallbacks', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      image_thumb: 'https://example.test/seed-thumb.jpg',
      tags: [{ id: 'g2', name: 'Distinctive', rating: 4, spoiler: 0 }],
    }));
    vi.mocked(vndbAdvancedSearchRaw).mockResolvedValueOnce(
      Array.from({ length: 25 }, (_unused, index) => hit(`v${index + 10}`)),
    );

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1' }),
    }));

    expect(html).toContain('Showing up to 24 results.');
    expect(html).toContain('Recommendation v33');
    expect(html).not.toContain('Recommendation v34');
    expect(html).toContain('data-testid="seed-picker">undefined:v1:https://example.test/seed-thumb.jpg');
  });

  it('uses the remote full seed image after local and thumbnail fallbacks', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      image_url: 'https://example.test/seed.jpg',
    }));

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1' }),
    }));

    expect(html).toContain('data-testid="seed-picker">undefined:v1:https://example.test/seed.jpg');
  });

  it('renders a null seed chip image when no artwork exists', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem());

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1' }),
    }));

    expect(html).toContain('data-testid="seed-picker">undefined:v1:');
    expect(html).toContain('No similar VNs found.');
  });

  it('falls back to a tag id when a failed seed has a blank stored name', async () => {
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      tags: [{ id: 'g9', name: '', rating: 1, spoiler: 0 }],
    }));
    vi.mocked(vndbAdvancedSearchRaw).mockRejectedValueOnce(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = renderToStaticMarkup(await SimilarPage({
      searchParams: Promise.resolve({ vn: 'v1', tags: 'g9' }),
    }));

    expect(html).toContain('Some searches failed (g9).');
    consoleError.mockRestore();
  });
});
