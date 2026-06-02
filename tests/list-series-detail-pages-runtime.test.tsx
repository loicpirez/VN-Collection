import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ListDetailPage, { generateMetadata as generateListMetadata } from '@/app/lists/[id]/page';
import SeriesDetailPage, { generateMetadata as generateSeriesMetadata } from '@/app/series/[id]/page';
import {
  countListMembershipsByVn,
  getAppSetting,
  getReadingQueueVnIds,
  getSeries,
  getUserList,
  listCollectionForCards,
  listUserListItems,
  type UserList,
  type UserListItem,
} from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionCardItem, SeriesWithVns } from '@/lib/types';
import type { CardData } from '@/components/VnCard';

interface ListDbRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  custom_cover: string | null;
  released: string | null;
  rating: number | null;
  user_rating: number | null;
  playtime_minutes: number | null;
  length_minutes: number | null;
  status: string | null;
  edition_type: string | null;
  favorite: number | null;
  developers: string | null;
  publishers: string | null;
  relations: string | null;
}

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

const sqlMocks = vi.hoisted(() => {
  const all = vi.fn<(...ids: string[]) => ListDbRow[]>();
  return {
    all,
    prepare: vi.fn<(sql: string) => { all: typeof all }>(() => ({ all })),
  };
});

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db', () => ({
  countListMembershipsByVn: vi.fn(),
  db: { prepare: sqlMocks.prepare },
  getAppSetting: vi.fn(),
  getReadingQueueVnIds: vi.fn(),
  getSeries: vi.fn(),
  getUserList: vi.fn(),
  listCollectionForCards: vi.fn(),
  listUserListItems: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('@/lib/files', () => ({
  publicUrlFor: vi.fn((path: string | null) => path ? `/files/${path}` : null),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/ListAddVnForm', () => ({
  ListAddVnForm: ({ listId }: { listId: number }) => <div data-testid="list-add">{listId}</div>,
}));

vi.mock('@/components/ListMetaEditor', () => ({
  ListMetaEditor: ({ list }: { list: UserList }) => <div data-testid="list-meta">{list.id}</div>,
}));

vi.mock('@/components/ListRemoveVn', () => ({
  ListRemoveVn: ({ listId, vnId }: { listId: number; vnId: string }) => <div data-testid="list-remove">{listId}:{vnId}</div>,
}));

vi.mock('@/components/ListReorderGrid', () => ({
  ListReorderGrid: ({ items }: { items: Array<{ vn_id: string; card: CardData | null }> }) => (
    <div data-testid="list-reorder">{JSON.stringify(items)}</div>
  ),
  StubCard: ({ vnId }: { vnId: string }) => <div data-testid="stub-card">{vnId}</div>,
}));

vi.mock('@/components/PaginatedGrid', () => ({
  PaginatedGrid: ({ children, resetKey }: { children: React.ReactNode; resetKey: string }) => <ul data-reset-key={resetKey}>{children}</ul>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

vi.mock('@/components/SeriesAddVnForm', () => ({
  SeriesAddVnForm: ({ seriesId }: { seriesId: number }) => <div data-testid="series-add">{seriesId}</div>,
}));

vi.mock('@/components/SeriesDetailLayout', () => ({
  SeriesDetailLayout: ({ sectionNodes }: { sectionNodes: Record<string, React.ReactNode> }) => (
    <div data-testid="series-layout">
      {Object.entries(sectionNodes).map(([id, node]) => <section key={id}>{node}</section>)}
    </div>
  ),
}));

vi.mock('@/components/SeriesMetaEditor', () => ({
  SeriesMetaEditor: ({ seriesId }: { seriesId: number }) => <div data-testid="series-meta">{seriesId}</div>,
}));

vi.mock('@/components/SeriesRemoveVn', () => ({
  SeriesRemoveVn: ({ seriesId, vnId }: { seriesId: number; vnId: string }) => <div data-testid="series-remove">{seriesId}:{vnId}</div>,
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: CardData }) => <div data-testid="vn-card">{JSON.stringify(data)}</div>,
}));

function list(overrides: Partial<UserList> = {}): UserList {
  return {
    id: 1,
    name: 'Favorites',
    slug: 'favorites',
    description: null,
    color: null,
    icon: null,
    pinned: 0,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

function listItem(vnId: string, orderIndex = 0): UserListItem {
  return {
    list_id: 1,
    vn_id: vnId,
    order_index: orderIndex,
    added_at: 1,
    note: null,
  };
}

function row(id: string, overrides: Partial<ListDbRow> = {}): ListDbRow {
  return {
    id,
    title: `Title ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    released: null,
    rating: null,
    user_rating: null,
    playtime_minutes: null,
    length_minutes: null,
    status: null,
    edition_type: null,
    favorite: null,
    developers: null,
    publishers: null,
    relations: null,
    ...overrides,
  };
}

function series(overrides: Partial<SeriesWithVns> = {}): SeriesWithVns {
  return {
    id: 7,
    name: 'Series Name',
    description: null,
    cover_path: null,
    banner_path: null,
    created_at: 1,
    updated_at: 2,
    vns: [],
    ...overrides,
  };
}

function card(id: string): CollectionCardItem {
  return {
    id,
    title: `Title ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    released: null,
    length_minutes: null,
    rating: null,
    developers: [],
    publishers: [],
    tags: [],
    relations: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    fetched_at: 1,
  };
}

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  sqlMocks.prepare.mockClear();
  sqlMocks.all.mockReset().mockReturnValue([]);
  vi.mocked(countListMembershipsByVn).mockReset().mockReturnValue(new Map());
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(getReadingQueueVnIds).mockReset().mockReturnValue(new Set());
  vi.mocked(getSeries).mockReset().mockReturnValue(null);
  vi.mocked(getUserList).mockReset().mockReturnValue(null);
  vi.mocked(listCollectionForCards).mockReset().mockReturnValue([]);
  vi.mocked(listUserListItems).mockReset().mockReturnValue([]);
});

describe('series detail page runtime', () => {
  it('normalizes invalid and missing metadata ids and rejects invalid or missing detail ids', async () => {
    expect(await generateSeriesMetadata({ params: Promise.resolve({ id: 'invalid' }) })).toEqual({});
    expect(await generateSeriesMetadata({ params: Promise.resolve({ id: '7' }) })).toEqual({});
    await expect(SeriesDetailPage({ params: Promise.resolve({ id: 'invalid' }) })).rejects.toThrow('not-found');
    await expect(SeriesDetailPage({ params: Promise.resolve({ id: '7' }) })).rejects.toThrow('not-found');
  });

  it('renders an empty series with the placeholder icon', async () => {
    vi.mocked(getSeries).mockReturnValue(series());

    expect(await generateSeriesMetadata({ params: Promise.resolve({ id: '7' }) })).toEqual({ title: 'Series Name' });
    const html = renderToStaticMarkup(await SeriesDetailPage({ params: Promise.resolve({ id: '7' }) }));

    expect(html).toContain('Series Name');
    expect(html).toContain(dictionaries.en.series.emptyDetail);
    expect(html).toContain('data-testid="series-meta"');
  });

  it('renders banner, cover, description, and enriched VN card state', async () => {
    vi.mocked(getSeries).mockReturnValue(series({ description: 'Description', cover_path: 'cover.jpg', banner_path: 'banner.jpg' }));
    vi.mocked(listCollectionForCards).mockReturnValue([card('v1')]);
    vi.mocked(countListMembershipsByVn).mockReturnValue(new Map([['v1', 3]]));
    vi.mocked(getReadingQueueVnIds).mockReturnValue(new Set(['v1']));

    const html = renderToStaticMarkup(await SeriesDetailPage({ params: Promise.resolve({ id: '7' }) }));

    expect(html).toContain('src="/files/banner.jpg"');
    expect(html).toContain('src="/files/cover.jpg"');
    expect(html).toContain('Description');
    expect(html).toContain('&quot;listCount&quot;:3');
    expect(html).toContain('&quot;inReadingQueue&quot;:true');
    expect(html).toContain('data-testid="series-remove"');
  });
});

describe('list detail page runtime', () => {
  it('normalizes invalid and missing metadata ids and rejects invalid or missing detail ids', async () => {
    expect(await generateListMetadata({ params: Promise.resolve({ id: 'invalid' }) })).toEqual({});
    expect(await generateListMetadata({ params: Promise.resolve({ id: '1' }) })).toEqual({});
    await expect(ListDetailPage({ params: Promise.resolve({ id: 'invalid' }) })).rejects.toThrow('not-found');
    await expect(ListDetailPage({ params: Promise.resolve({ id: '1' }) })).rejects.toThrow('not-found');
  });

  it('renders an empty list with optional list metadata', async () => {
    vi.mocked(getUserList).mockReturnValue(list({ description: 'Description', color: '#ef4444', pinned: 1 }));

    expect(await generateListMetadata({ params: Promise.resolve({ id: '1' }) })).toEqual({ title: 'Favorites' });
    const html = renderToStaticMarkup(await ListDetailPage({ params: Promise.resolve({ id: '1' }) }));

    expect(html).toContain('Description');
    expect(html).toContain('background-color:#ef4444');
    expect(html).toContain(dictionaries.en.lists.detailEmpty);
    expect(sqlMocks.prepare).not.toHaveBeenCalled();
  });

  it('renders reorder cards, missing-row stubs, and parsed card metadata', async () => {
    vi.mocked(getUserList).mockReturnValue(list());
    vi.mocked(listUserListItems).mockReturnValue([listItem('v1'), listItem('v2', 1)]);
    vi.mocked(getReadingQueueVnIds).mockReturnValue(new Set(['v1']));
    vi.mocked(countListMembershipsByVn).mockReturnValue(new Map([['v1', 2]]));
    sqlMocks.all.mockReturnValue([
      row('v1', {
        image_thumb: 'thumb.jpg',
        local_image_thumb: 'local-thumb.jpg',
        status: 'playing',
        edition_type: 'physical',
        favorite: 1,
        developers: JSON.stringify([{ id: 'p1', name: 'Studio' }, null, { name: '' }]),
        publishers: 'invalid-json',
        relations: JSON.stringify([{ relation: 'orig' }, null, { relation: 1 }]),
      }),
    ]);

    const html = renderToStaticMarkup(await ListDetailPage({ params: Promise.resolve({ id: '1' }) }));

    expect(html).toContain('data-testid="list-reorder"');
    expect(html).toContain('&quot;vn_id&quot;:&quot;v2&quot;,&quot;card&quot;:null');
    expect(html).toContain('&quot;poster&quot;:&quot;thumb.jpg&quot;');
    expect(html).toContain('&quot;localPoster&quot;:&quot;local-thumb.jpg&quot;');
    expect(html).toContain('&quot;status&quot;:&quot;playing&quot;');
    expect(html).toContain('&quot;editionType&quot;:&quot;physical&quot;');
    expect(html).toContain('&quot;favorite&quot;:true');
    expect(html).toContain('&quot;inReadingQueue&quot;:true');
    expect(html).toContain('&quot;isFanDisc&quot;:true');
    expect(html).toContain('&quot;listCount&quot;:2');
  });

  it('uses paginated cards above the reorder threshold and chunks large VN queries', async () => {
    const items = Array.from({ length: 501 }, (_, index) => listItem(`v${index + 1}`, index));
    vi.mocked(getUserList).mockReturnValue(list());
    vi.mocked(listUserListItems).mockReturnValue(items);
    sqlMocks.all.mockImplementation((...ids) => ids.includes('v1') ? [row('v1')] : []);

    const html = renderToStaticMarkup(await ListDetailPage({ params: Promise.resolve({ id: '1' }) }));

    expect(sqlMocks.prepare).toHaveBeenCalledTimes(2);
    expect(html).toContain('data-reset-key="list:1"');
    expect(html).toContain('data-testid="vn-card"');
    expect(html).toContain('data-testid="stub-card"');
  });
});
