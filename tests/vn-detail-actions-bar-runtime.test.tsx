import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VnDetailActionsBar } from '@/components/VnDetailActionsBar';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionItem } from '@/lib/types';

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('@/components/ActionMenu', () => ({
  ActionMenu: ({ children, label }: { children: React.ReactNode; label: string }) => <section data-menu={label}>{children}</section>,
}));

vi.mock('@/components/AnimeChip', () => ({
  AnimeChip: ({ vnId }: { vnId: string }) => <div>{`anime:${vnId}`}</div>,
}));

vi.mock('@/components/BannerControls', () => ({
  BannerControls: ({ hasCustomBanner, vnId }: { hasCustomBanner: boolean; vnId: string }) => <div>{`banner-controls:${vnId}:${hasCustomBanner}`}</div>,
}));

vi.mock('@/components/BannerSourcePicker', () => ({
  BannerSourcePicker: ({ coverLocal, vnId }: { coverLocal: string | null; vnId: string }) => <div>{`banner-picker:${vnId}:${coverLocal ?? 'none'}`}</div>,
}));

vi.mock('@/components/CompareWithButton', () => ({
  CompareWithButton: ({ currentVnId }: { currentVnId: string }) => <div>{`compare:${currentVnId}`}</div>,
}));

vi.mock('@/components/CoverQuickActions', () => ({
  CoverQuickActions: ({ mode, vnId }: { mode: string; vnId: string }) => <div>{`quick:${vnId}:${mode}`}</div>,
}));

vi.mock('@/components/CoverPickerTrigger', () => ({
  CoverPickerTrigger: ({ vnId }: { vnId: string }) => <div>{`cover-trigger:${vnId}`}</div>,
}));

vi.mock('@/components/CoverSourcePicker', () => ({
  CoverSourcePicker: ({
    currentImageSource,
    currentRotation,
    egsId,
    releaseImages,
    screenshots,
    vnId,
  }: {
    currentImageSource: string;
    currentRotation: number;
    egsId: number | null;
    releaseImages: CollectionItem['release_images'];
    screenshots: CollectionItem['screenshots'];
    vnId: string;
  }) => <div>{`cover-picker:${vnId}:${egsId ?? 'none'}:${currentImageSource}:${currentRotation}:${screenshots.length}:${releaseImages.length}`}</div>,
}));

vi.mock('@/components/CoverUploader', () => ({
  CoverUploader: ({ hasCustom, vnId }: { hasCustom: boolean; vnId: string }) => <div>{`uploader:${vnId}:${hasCustom}`}</div>,
}));

vi.mock('@/components/DownloadAssetsButton', () => ({
  DownloadAssetsButton: ({ dataState, vnId }: { dataState: string; vnId: string }) => <div>{`download:${vnId}:${dataState}`}</div>,
}));

vi.mock('@/components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: ({ initial, vnId }: { initial: boolean; vnId: string }) => <div>{`favorite:${vnId}:${initial}`}</div>,
}));

vi.mock('@/components/LinkToVndbButton', () => ({
  LinkToVndbButton: ({ seedQuery, vnId }: { seedQuery: string; vnId: string }) => <div>{`link-vndb:${vnId}:${seedQuery}`}</div>,
}));

vi.mock('@/components/ListsPickerButton', () => ({
  ListsPickerButton: ({ vnId }: { vnId: string }) => <div>{`lists:${vnId}`}</div>,
}));

vi.mock('@/components/MapVnToEgsButton', () => ({
  MapVnToEgsButton: ({ seedQuery, vnId }: { seedQuery: string; vnId: string }) => <div>{`map-egs:${vnId}:${seedQuery}`}</div>,
}));

vi.mock('@/components/QueueButton', () => ({
  QueueButton: ({ vnId }: { vnId: string }) => <div>{`queue:${vnId}`}</div>,
}));

function collectionItem(id: string, overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id,
    title: `VN ${id}`,
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

async function renderBar(
  vn: CollectionItem,
  overrides: Partial<{
    inCollection: boolean;
    egsRow: { egs_id: number | null; image_url?: string | null } | null;
    egsHasImage: boolean;
    hasCustomBanner: boolean;
    imageSourcePref: 'auto' | 'vndb' | 'egs' | 'custom';
  }> = {},
): Promise<string> {
  return renderToStaticMarkup(await VnDetailActionsBar({
    vn,
    inCollection: false,
    egsRow: null,
    egsHasImage: false,
    hasCustomBanner: false,
    imageSourcePref: 'auto',
    ...overrides,
  }));
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('VN detail actions bar runtime', () => {
  it('renders public VNDB actions, safe external links, and the no-data state outside the collection', async () => {
    const html = await renderBar(collectionItem('v90001', {
      fetched_at: 0,
      extlinks: [
        { url: 'https://example.com/game', label: 'Official site', name: 'Official site' },
        { url: 'javascript:alert(1)', label: 'Unsafe', name: 'Unsafe' },
      ],
      screenshots: [{ url: 'shot.jpg', thumbnail: 'thumb.jpg' }],
      release_images: [{ release_id: 'r1', release_title: 'Release', type: 'pkgfront', url: 'cover.jpg' }],
    }), {
      egsRow: { egs_id: 42, image_url: null },
      egsHasImage: true,
      imageSourcePref: 'egs',
    });

    expect(html).toContain('quick:v90001:tracking');
    expect(html).toContain('lists:v90001');
    expect(html).not.toContain('favorite:v90001');
    expect(html).not.toContain('quick:v90001:danger');
    expect(html).toContain('href="https://vndb.org/v90001"');
    expect(html).toContain('game=42');
    expect(html).toContain('href="https://example.com/game"');
    expect(html).not.toContain('javascript:alert');
    expect(html).toContain('download:v90001:none');
    expect(html).toContain('map-egs:v90001:VN v90001');
    expect(html).toContain('cover-picker:v90001:42:egs:0:1:1');
  });

  it('renders every collection-only cluster and the complete data state', async () => {
    const html = await renderBar(collectionItem('v90002', {
      alttitle: '  Alternate title  ',
      banner_image: 'banner.jpg',
      custom_cover: 'custom.jpg',
      favorite: true,
      fetched_at: Date.now(),
      local_image_thumb: 'local-thumb.jpg',
      platforms: ['win'],
    }), {
      inCollection: true,
      hasCustomBanner: true,
      imageSourcePref: 'custom',
    });

    expect(html).toContain('favorite:v90002:true');
    expect(html).toContain('queue:v90002');
    expect(html).toContain('anime:v90002');
    expect(html).toContain('cover-trigger:v90002');
    expect(html).toContain('banner-picker:v90002:local-thumb.jpg');
    expect(html).toContain('uploader:v90002:true');
    expect(html).toContain('banner-controls:v90002:true');
    expect(html).toContain('download:v90002:complete');
    expect(html).toContain('quick:v90002:danger');
    expect(html).toContain('map-egs:v90002:Alternate title');
  });

  it('renders partial state variants for stale data, missing artwork, and missing platforms', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T00:00:00Z'));
    const completeBase = {
      title: 'Known title',
      fetched_at: new Date('2026-01-30T00:00:00Z').getTime(),
      local_image: 'local.jpg',
      platforms: ['win'],
    };

    expect(await renderBar(collectionItem('v90003', {
      ...completeBase,
      fetched_at: new Date('2025-01-01T00:00:00Z').getTime(),
    }))).toContain('download:v90003:partial');
    expect(await renderBar(collectionItem('v90004', {
      ...completeBase,
      local_image: null,
    }))).toContain('download:v90004:partial');
    expect(await renderBar(collectionItem('v90005', {
      ...completeBase,
      platforms: [],
    }))).toContain('download:v90005:partial');
  });

  it('treats placeholder titles as no-data state', async () => {
    expect(await renderBar(collectionItem('v90006', {
      title: 'v90006',
      fetched_at: Date.now(),
      local_image: 'local.jpg',
      platforms: ['win'],
    }))).toContain('download:v90006:none');
  });

  it('renders synthetic mapping without VNDB data actions or an empty external menu', async () => {
    let html = await renderBar(collectionItem('egs_42'));

    expect(html).toContain('link-vndb:egs_42:VN egs_42');
    expect(html).not.toContain('map-egs:egs_42');
    expect(html).not.toContain('download:egs_42');
    expect(html).not.toContain(`data-menu="${dictionaries.en.detail.actions.groupExternal}"`);

    html = await renderBar(collectionItem('egs_43', {
      alttitle: '  Synthetic alternate  ',
      extlinks: [{ url: 'https://example.com/synthetic', label: 'Synthetic site', name: 'Synthetic site' }],
    }), {
      egsRow: { egs_id: 43 },
    });
    expect(html).toContain('link-vndb:egs_43:Synthetic alternate');
    expect(html).toContain('href="https://example.com/synthetic"');
    expect(html).toContain('game=43');
  });
});
