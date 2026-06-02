import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import ShelfPage, { generateMetadata } from '@/app/shelf/page';
import {
  getAppSetting,
  listAllOwnedReleases,
  listShelfDisplaySlots,
  listShelves,
  listUnplacedOwnedReleases,
  type ShelfDisplaySlotEntry,
  type ShelfEntry,
  type ShelfUnitWithCount,
} from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dynamicMocks = vi.hoisted(() => ({
  loads: [] as Array<Promise<unknown>>,
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options: { loading: () => React.ReactNode }) => {
    dynamicMocks.loads.push(loader());
    return ({ initialShelves, initialUnplaced }: { initialShelves: ShelfUnitWithCount[]; initialUnplaced: ShelfEntry[] }) => (
      <>
        {options.loading()}
        <div>{`layout-editor:${initialShelves.length}:${initialUnplaced.length}`}</div>
      </>
    );
  },
}));

vi.mock('@/lib/db', () => ({
  getAppSetting: vi.fn(),
  listAllOwnedReleases: vi.fn(),
  listShelfDisplaySlots: vi.fn(),
  listShelves: vi.fn(),
  listUnplacedOwnedReleases: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div>{`density:${scope}`}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, sexual, src }: { alt: string; localSrc?: string | null; sexual?: number | null; src?: string | null }) => (
    <img alt={alt} data-local={localSrc ?? ''} data-sexual={sexual ?? ''} {...(src ? { src } : {})} />
  ),
}));

vi.mock('@/components/ShelfReadOnlyControls', () => ({
  ShelfReadOnlyControls: ({
    activeShelfId,
    activeShelfName,
    displayZones,
    hasDisplaySlots,
    id,
    shelfCols,
    shelfRows,
  }: {
    activeShelfId?: string;
    activeShelfName?: string;
    displayZones: Array<{ afterRow: number; label: string }>;
    hasDisplaySlots: boolean;
    id?: string;
    shelfCols?: number;
    shelfRows?: number;
  }) => (
    <div>{`controls:${id ?? 'header'}:${activeShelfId ?? 'none'}:${activeShelfName ?? 'none'}:${hasDisplaySlots}:${shelfCols ?? 'none'}:${shelfRows ?? 'none'}:${displayZones.map((zone) => `${zone.afterRow}-${zone.label}`).join('|')}`}</div>
  ),
}));

vi.mock('@/components/ShelfSpatialView', () => ({
  ShelfSpatialView: ({
    activeShelf,
    controlsSlot,
    defaultOrientation,
    displayRowOrientations,
  }: {
    activeShelf?: number;
    controlsSlot?: React.ReactNode;
    defaultOrientation?: string;
    displayRowOrientations?: Record<string, string>;
  }) => (
    <div>
      {`spatial:${activeShelf ?? 'none'}:${defaultOrientation ?? 'none'}:${JSON.stringify(displayRowOrientations ?? {})}`}
      {controlsSlot}
    </div>
  ),
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}): Promise<string> {
  const stream = await renderToReadableStream(await ShelfPage({ searchParams: Promise.resolve(searchParams) }));
  await stream.allReady;
  return new Response(stream).text();
}

function shelf(overrides: Partial<ShelfUnitWithCount> = {}): ShelfUnitWithCount {
  return {
    id: 1,
    name: 'Shelf One',
    cols: 4,
    rows: 2,
    order_index: 0,
    created_at: 1,
    updated_at: 1,
    placed_count: 0,
    ...overrides,
  };
}

function display(afterRow: number): ShelfDisplaySlotEntry {
  return {
    shelf_id: 1,
    after_row: afterRow,
    position: 0,
    vn_id: 'v1',
    release_id: 'r1',
    placed_at: 1,
    vn_title: 'Display VN',
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    edition_label: null,
    box_type: 'none',
    condition: null,
    owned_platform: null,
    physical_location: [],
    price_paid: null,
    currency: null,
    acquired_date: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    dumped: false,
  };
}

function entry(vnId: string, releaseId: string, overrides: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    vn_id: vnId,
    release_id: releaseId,
    notes: null,
    location: 'unknown',
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
    vn_title: `VN ${vnId}`,
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: false,
    rel_has_ero: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(listAllOwnedReleases).mockReset().mockReturnValue([]);
  vi.mocked(listShelfDisplaySlots).mockReset().mockReturnValue([]);
  vi.mocked(listShelves).mockReset().mockReturnValue([]);
  vi.mocked(listUnplacedOwnedReleases).mockReset().mockReturnValue([]);
});

describe('shelf page runtime', () => {
  it('renders metadata and the empty shelf state', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.nav.shelf });

    const html = await renderPage();

    expect(html).toContain(dictionaries.en.shelf.empty);
    expect(html).toContain(dictionaries.en.shelf.emptyHint.replaceAll('"', '&quot;'));
    expect(html).toContain('controls:header:none:none:false:none:none:');
  });

  it('falls back to defaults and still renders the empty state after a DB failure', async () => {
    vi.mocked(listShelves).mockImplementation(() => {
      throw new Error('offline');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = await renderPage();

    expect(html).toContain(dictionaries.en.shelf.empty);
    expect(errorSpy).toHaveBeenCalledWith('[shelf page] DB error:', 'offline');
    errorSpy.mockRestore();
  });

  it('resolves spatial prefs, array query params, and all display-zone labels', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([entry('v1', 'r1')]);
    vi.mocked(listShelves).mockReturnValue([shelf()]);
    vi.mocked(listShelfDisplaySlots).mockReturnValue([display(2), display(0), display(1), display(1)]);
    vi.mocked(getAppSetting).mockImplementation((key: string) => key === 'shelf_display_overrides_v1'
      ? JSON.stringify({
          global: {
            displayOrientation: 'portrait',
            displayRowOrientations: {},
          },
          shelves: {
            1: {
              displayOrientation: 'landscape',
              displayRowOrientations: { 1: 'landscape' },
            },
          },
        })
      : null);

    const html = await renderPage({ view: ['spatial'], shelf: ['1'] });

    expect(html).toContain('spatial:1:landscape:{&quot;1&quot;:&quot;landscape&quot;}');
    expect(html).toContain(dictionaries.en.shelfSpatial.topDisplay);
    expect(html).toContain(dictionaries.en.shelfSpatial.bottomDisplay);
    expect(html).toContain(dictionaries.en.shelfSpatial.betweenRow.replace('{above}', '1').replace('{below}', '2'));
    expect(html).toContain('controls:fullscreen:1:Shelf One:true:4:2:');
  });

  it('renders release groups with exact-edition artwork, metadata priority, and unsorted rows', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([
      entry('v1', 'synthetic:v1', {
        vn_title: 'Primary VN',
        physical_location: ['B shelf', 'Box 2'],
        box_type: 'bigbox',
        edition_label: 'Limited edition',
        condition: 'good',
        price_paid: 12.5,
        currency: 'USD',
        acquired_date: '2024-01-02',
        owned_platform: 'win',
        dumped: true,
        rel_image_url: 'release-full.jpg',
        rel_image_thumb: 'release-thumb.jpg',
        rel_local_image_thumb: 'release-local.jpg',
        rel_image_sexual: 2,
        vn_image_url: 'vn-full.jpg',
        vn_local_image_thumb: 'vn-local.jpg',
        vn_image_sexual: 1,
        rel_title: 'Physical release title',
        rel_platforms: ['win', 'ps2'],
        rel_languages: ['ja'],
        vn_platforms: ['swi'],
        vn_languages: ['en'],
      }),
      entry('v2', 'r2', {
        vn_title: 'Fallback VN',
        physical_location: [],
        price_paid: 3.25,
        currency: null,
        vn_image_thumb: 'vn-thumb.jpg',
        vn_platforms: ['swi'],
        vn_languages: ['en'],
      }),
      entry('v3', 'r3', {
        vn_title: 'No metadata VN',
        physical_location: ['A shelf'],
        box_type: 'custom-box',
        condition: 'custom-condition',
        price_paid: 1,
        currency: 'A!',
      }),
      entry('v4', 'r4', {
        vn_title: 'Second B-shelf VN',
        physical_location: ['B shelf'],
      }),
    ]);

    const html = await renderPage({ view: 'release' });

    expect(html.indexOf('A shelf')).toBeLessThan(html.indexOf('B shelf'));
    expect(html.indexOf('B shelf')).toBeLessThan(html.indexOf(dictionaries.en.shelf.unsorted));
    expect(html).toContain('src="release-full.jpg"');
    expect(html).toContain('data-local="release-local.jpg"');
    expect(html).toContain('Physical release title');
    expect(html).toContain('Limited edition');
    expect(html).toContain('Box 2');
    expect(html).toContain('Windows');
    expect(html).toContain('PlayStation 2');
    expect(html).toContain(dictionaries.en.shelf.alsoOnRelease);
    expect(html).toContain('Nintendo Switch');
    expect(html).toContain('custom-box');
    expect(html).toContain('custom-condition');
    expect(html).toContain('EGS');
    expect(html).toContain(dictionaries.en.shelf.dumped);
  });

  it('renders per-item aggregates using release cover priority and VN fallbacks', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([
      entry('v2', 'r2', {
        vn_title: 'Beta VN',
        physical_location: ['Shelf B'],
        price_paid: 2,
        currency: 'USD',
      }),
      entry('v1', 'r1', {
        vn_title: 'Alpha VN',
        physical_location: ['Shelf A'],
        price_paid: 1,
        currency: null,
        rel_image_thumb: 'alpha-release.jpg',
        dumped: true,
      }),
      entry('v1', 'r3', {
        vn_title: 'Alpha VN',
        physical_location: ['Shelf C'],
        price_paid: 3,
        currency: null,
      }),
    ]);

    const html = await renderPage({ view: 'item' });

    expect(html.indexOf('Alpha VN')).toBeLessThan(html.indexOf('Beta VN'));
    expect(html).toContain('src="alpha-release.jpg"');
    expect(html).toContain('Shelf A / Shelf C');
    expect(html).toContain(dictionaries.en.shelf.editionsForVn.replace('{n}', '2'));
    expect(html).toContain(dictionaries.en.shelf.dumped);
  });

  it('hands shelf and pool fixtures to the lazy layout editor', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([entry('v1', 'r1')]);
    vi.mocked(listShelves).mockReturnValue([shelf()]);
    vi.mocked(listUnplacedOwnedReleases).mockReturnValue([entry('v2', 'r2')]);

    const html = await renderPage({ view: 'layout' });
    await Promise.all(dynamicMocks.loads);

    expect(html).toContain(dictionaries.en.shelfLayout.title);
    expect(html).toContain('layout-editor:1:1');
  });

  it('renders spatial controls without an active shelf when owned releases exist', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([entry('v1', 'r1')]);

    const html = await renderPage();

    expect(html).toContain('spatial:1:portrait:{}');
    expect(html).toContain('controls:fullscreen:none:none:false:none:none:');
  });

  it('normalizes unsupported views and invalid shelf indexes to the default spatial view', async () => {
    vi.mocked(listAllOwnedReleases).mockReturnValue([entry('v1', 'r1')]);
    vi.mocked(listShelves).mockReturnValue([shelf()]);

    let html = await renderPage({ view: 'unsupported', shelf: 'bad' });
    expect(html).toContain('spatial:1:portrait:{}');

    html = await renderPage({ shelf: '0' });
    expect(html).toContain('spatial:1:portrait:{}');
  });
});
