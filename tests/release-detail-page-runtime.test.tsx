import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReleasePage, { generateMetadata as generateReleaseMetadata } from '@/app/release/[id]/page';
import {
  getCollectionItem,
  getOwnedRelease,
  isInCollectionMany,
  upsertReleaseResolutionCache,
  type OwnedReleaseRow,
} from '@/lib/db';
import { getRelease, type VndbRelease } from '@/lib/vndb';
import type { CollectionItem } from '@/lib/types';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

const serverMocks = vi.hoisted(() => ({
  after: vi.fn((callback: () => void) => callback()),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('next/server', () => ({
  after: serverMocks.after,
}));

vi.mock('@/lib/db', () => ({
  getCollectionItem: vi.fn(),
  getOwnedRelease: vi.fn(),
  isInCollectionMany: vi.fn(),
  upsertReleaseResolutionCache: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getRelease: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => (await import('@/lib/i18n/dictionaries')).dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/LangFlag', () => ({
  LangFlag: ({ lang, withCode }: { lang: string; withCode?: boolean }) => <span data-testid="lang-flag">{lang}:{String(withCode)}</span>,
}));

vi.mock('@/components/ReleaseOwnedToggle', () => ({
  ReleaseOwnedToggle: ({
    initialInCollection,
    initialOwned,
    releaseId,
    vnId,
    vnRelation,
    vnTitle,
  }: {
    initialInCollection: boolean;
    initialOwned: boolean;
    releaseId: string;
    vnId: string;
    vnRelation: string;
    vnTitle: string;
  }) => (
    <div data-testid="owned-toggle">
      {releaseId}:{vnId}:{vnTitle}:{vnRelation}:{String(initialInCollection)}:{String(initialOwned)}
    </div>
  ),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({
    alt,
    fit,
    localSrc,
    src,
  }: {
    alt: string;
    fit?: string;
    localSrc?: string | null;
    src?: string | null;
  }) => <img alt={alt} data-fit={fit} src={localSrc ?? src ?? undefined} />,
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

function release(overrides: Partial<VndbRelease> = {}): VndbRelease {
  return {
    id: 'r1',
    title: 'Release',
    alttitle: null,
    languages: [],
    platforms: [],
    media: [],
    released: null,
    minage: null,
    patch: false,
    freeware: false,
    uncensored: null,
    official: false,
    has_ero: false,
    resolution: null,
    engine: null,
    voiced: null,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [],
    extlinks: [],
    vns: [],
    images: [],
    ...overrides,
  };
}

function collectionItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: 'v1',
    title: 'Parent visual novel',
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

function ownedRelease(overrides: Partial<OwnedReleaseRow> = {}): OwnedReleaseRow {
  return {
    vn_id: 'v1',
    release_id: 'r1',
    notes: null,
    location: 'jp',
    physical_location: [],
    box_type: 'none',
    edition_label: null,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    owned_platform: null,
    dumped: false,
    added_at: 1,
    ...overrides,
  };
}

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  serverMocks.after.mockClear();
  vi.mocked(getCollectionItem).mockReset().mockReturnValue(null);
  vi.mocked(getOwnedRelease).mockReset().mockReturnValue(null);
  vi.mocked(isInCollectionMany).mockReset().mockReturnValue(new Set());
  vi.mocked(upsertReleaseResolutionCache).mockReset();
  vi.mocked(getRelease).mockReset().mockResolvedValue(null);
});

describe('release detail page runtime', () => {
  it('builds metadata from the fetched release, lowercases ids, and falls back after upstream failures', async () => {
    expect(await generateReleaseMetadata({ params: Promise.resolve({ id: 'R1' }) })).toEqual({ title: 'R1 - Releases' });
    expect(getRelease).toHaveBeenCalledWith('r1');

    vi.mocked(getRelease).mockResolvedValueOnce(release({ title: 'Fetched release' }));
    expect(await generateReleaseMetadata({ params: Promise.resolve({ id: 'R1' }) })).toEqual({ title: 'Fetched release - Releases' });

    vi.mocked(getRelease).mockRejectedValueOnce(new Error('offline'));
    expect(await generateReleaseMetadata({ params: Promise.resolve({ id: 'R2' }) })).toEqual({ title: 'R2 - Releases' });
  });

  it('rejects malformed, missing, and upstream-failed releases', async () => {
    await expect(ReleasePage({ params: Promise.resolve({ id: 'bad' }) })).rejects.toThrow('not-found');
    await expect(ReleasePage({ params: Promise.resolve({ id: 'r404' }) })).rejects.toThrow('not-found');

    vi.mocked(getRelease).mockRejectedValueOnce(new Error('offline'));
    await expect(ReleasePage({ params: Promise.resolve({ id: 'r500' }) })).rejects.toThrow('not-found');
  });

  it('renders a minimal release, home back link, no-visuals state, and deferred empty-VN cache write', async () => {
    vi.mocked(getRelease).mockResolvedValueOnce(release());

    const html = renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ id: 'r1' }) }));

    expect(html).toContain('Release');
    expect(html).toContain('href="/"');
    expect(html).toContain('No artwork for this edition.');
    expect(upsertReleaseResolutionCache).toHaveBeenCalledWith({ releaseId: 'r1', resolution: null });
  });

  it('renders parent VN cover fallback when the release has no artwork', async () => {
    vi.mocked(getRelease).mockResolvedValueOnce(release({
      vns: [{ id: 'v1', rtype: 'complete', title: 'Linked visual novel' }],
    }));
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem({
      image_url: 'https://example.test/parent.jpg',
      local_image_thumb: '/local/parent.jpg',
      image_sexual: 1,
    }));

    const html = renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ id: 'r1' }) }));

    expect(html).toContain('href="/vn/v1"');
    expect(html).toContain('/local/parent.jpg');
    expect(html).toContain('Parent VN cover');
    expect(upsertReleaseResolutionCache).toHaveBeenCalledWith({ releaseId: 'r1', vnId: 'v1', resolution: null });
  });

  it('renders the no-artwork notice when a linked parent VN has no cover', async () => {
    vi.mocked(getRelease).mockResolvedValueOnce(release({
      vns: [{ id: 'v1', rtype: 'complete' }],
    }));
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem());

    const html = renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ id: 'r1' }) }));

    expect(html).toContain('No artwork for this edition.');
    expect(html).not.toContain('Parent VN cover');
  });

  it('renders rich release metadata, inventory toggles, safe links, and all artwork aspect families', async () => {
    vi.mocked(getRelease).mockResolvedValueOnce(release({
      title: 'Rich release',
      alttitle: 'Alternative release',
      released: '2024-02-03',
      languages: [
        { lang: 'ja', title: null, latin: null, mtl: false, main: true },
        { lang: 'en', title: null, latin: null, mtl: true, main: false },
      ],
      platforms: ['win', 'swi'],
      minage: 18,
      voiced: 4,
      resolution: [1920, 1080],
      engine: 'Engine',
      media: [{ medium: 'dvd', qty: 1 }, { medium: 'cd', qty: 2 }],
      gtin: '123456789',
      catalog: 'CAT-1',
      producers: [
        { id: 'p1', developer: true, publisher: false, name: 'Developer' },
        { id: 'p2', developer: false, publisher: true, name: 'Publisher' },
      ],
      official: true,
      patch: true,
      freeware: true,
      uncensored: true,
      has_ero: true,
      notes: 'Release notes',
      extlinks: [
        { url: 'https://example.test/release', label: 'Website', name: 'website' },
        { url: 'javascript:alert(1)', label: 'Unsafe', name: 'unsafe' },
      ],
      vns: [
        { id: 'v1', rtype: 'complete', title: 'First VN' },
        { id: 'v2', rtype: 'partial' },
      ],
      images: [
        { id: 'i1', url: 'https://example.test/front.jpg', type: 'pkgfront', sexual: 1, languages: ['ja'] },
        { id: 'i2', url: 'https://example.test/media.jpg', type: 'pkgmed' },
        { id: 'i3', url: 'https://example.test/digital.jpg', type: 'dig', languages: [] },
      ],
    }));
    vi.mocked(getCollectionItem).mockReturnValueOnce(collectionItem());
    vi.mocked(isInCollectionMany).mockReturnValueOnce(new Set(['v1']));
    vi.mocked(getOwnedRelease).mockReturnValueOnce(ownedRelease());

    const html = renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ id: 'r1' }) }));

    expect(html).toContain('Alternative release');
    expect(html).toContain('Feb 3, 2024');
    expect(html).toContain('ja:true');
    expect(html).toContain('en:true');
    expect(html).toContain('(Machine TL)');
    expect(html).toContain('Windows');
    expect(html).toContain('Nintendo Switch');
    expect(html).toContain('18+');
    expect(html).toContain('1920x1080');
    expect(html).toContain('Engine');
    expect(html).toContain('dvd, cdx2');
    expect(html).toContain('123456789');
    expect(html).toContain('CAT-1');
    expect(html).toContain('href="/producer/p1"');
    expect(html).toContain('href="/producer/p2"');
    expect(html).toContain('Release notes');
    expect(html).toContain('href="https://example.test/release"');
    expect(html).not.toContain('Unsafe');
    expect(html).toContain('r1:v1:First VN:complete:true:true');
    expect(html).toContain('r1:v2:v2:partial:false:false');
    expect(html).toContain('This edition covers multiple VNs.');
    expect(html).toContain('aspect-square');
    expect(html).toContain('aspect-video');
    expect(html).toContain('aspect-[2/3]');
  });

  it('renders string resolutions and ignores unsupported voiced levels', async () => {
    vi.mocked(getRelease).mockResolvedValueOnce(release({
      resolution: 'non-standard',
      voiced: 9,
    }));

    const html = renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ id: 'r1' }) }));

    expect(html).toContain('non-standard');
    expect(html).not.toContain('Voice acting');
  });
});
