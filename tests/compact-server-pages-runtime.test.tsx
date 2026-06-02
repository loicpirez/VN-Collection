import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ListsPage, { generateMetadata as generateListsMetadata } from '@/app/lists/page';
import TagsPage, { generateMetadata as generateTagsMetadata } from '@/app/tags/page';
import LabelsPage, { generateMetadata as generateLabelsMetadata } from '@/app/labels/page';
import {
  getCacheFreshness,
  listCollectionForCards,
  listUserLists,
  type UserListWithCount,
} from '@/lib/db';
import { getVndbTagHomeTree } from '@/lib/vndb-tag-web-cache';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionCardItem } from '@/lib/types';
import type { VndbTagHomeTree } from '@/lib/vndb-tag-web-parser';

const qrMocks = vi.hoisted(() => ({
  toString: vi.fn<(text: string, options: Record<string, unknown>) => Promise<string>>(),
}));

vi.mock('@/lib/db', () => ({
  getCacheFreshness: vi.fn(),
  listCollectionForCards: vi.fn(),
  listUserLists: vi.fn(),
}));

vi.mock('@/lib/vndb-tag-web-cache', () => ({
  getVndbTagHomeTree: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      if (name === 'x-forwarded-proto') return 'https';
      if (name === 'x-forwarded-host') return 'library.example';
      return null;
    }),
  })),
}));

vi.mock('qrcode', () => ({
  toString: qrMocks.toString,
}));

vi.mock('@/components/CreateListForm', () => ({
  CreateListForm: () => <div data-testid="create-list" />,
}));

vi.mock('@/components/ListCardActions', () => ({
  ListCardActions: ({ list }: { list: UserListWithCount }) => <div data-testid="list-actions">{list.id}</div>,
}));

vi.mock('@/components/TagsBrowser', () => ({
  TagsBrowser: (props: Record<string, unknown>) => <div data-testid="tags-browser">{JSON.stringify(props)}</div>,
}));

vi.mock('@/components/PrintButton', () => ({
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

function userList(id: number, overrides: Partial<UserListWithCount> = {}): UserListWithCount {
  return {
    id,
    name: `List ${id}`,
    slug: `list-${id}`,
    description: null,
    color: null,
    icon: null,
    pinned: 0,
    created_at: 1,
    updated_at: 2,
    vn_count: 0,
    ...overrides,
  };
}

function card(id: number, overrides: Partial<CollectionCardItem> = {}): CollectionCardItem {
  return {
    id: `v${id}`,
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
    ...overrides,
  };
}

const tree: VndbTagHomeTree = {
  groups: [],
  recentlyAdded: [],
  popular: [],
};

beforeEach(() => {
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(null);
  vi.mocked(listCollectionForCards).mockReset().mockReturnValue([]);
  vi.mocked(listUserLists).mockReset().mockReturnValue([]);
  vi.mocked(getVndbTagHomeTree).mockReset().mockResolvedValue({
    data: tree,
    fetched_at: 1,
    stale: false,
    source_url: 'https://vndb.org/g',
  });
  qrMocks.toString.mockReset().mockResolvedValue('<svg><path /></svg>');
});

describe('lists page runtime', () => {
  it('renders metadata, the create form, and the empty state', async () => {
    expect(await generateListsMetadata()).toEqual({ title: dictionaries.en.lists.pageTitle });

    const html = renderToStaticMarkup(await ListsPage());

    expect(html).toContain('data-testid="create-list"');
    expect(html).toContain(dictionaries.en.lists.empty);
  });

  it('renders optional list metadata and singular or plural member counts', async () => {
    vi.mocked(listUserLists).mockReturnValue([
      userList(1, { name: 'Pinned list', description: 'Description', color: '#ef4444', pinned: 1, vn_count: 1 }),
      userList(2, { vn_count: 2 }),
    ]);

    const html = renderToStaticMarkup(await ListsPage());

    expect(html).toContain('href="/lists/1"');
    expect(html).toContain('background-color:#ef4444');
    expect(html).toContain('background-color:#475569');
    expect(html).toContain('Description');
    expect(html).toContain(dictionaries.en.lists.vnCountSingular.replace('{n}', '1'));
    expect(html).toContain(dictionaries.en.lists.vnCount.replace('{n}', '2'));
    expect(html).toContain('data-testid="list-actions"');
  });
});

describe('tags page runtime', () => {
  it('renders metadata and passes cache freshness, parsed mode, and prefetched tree to the browser', async () => {
    vi.mocked(getCacheFreshness).mockReturnValue(123);

    expect(await generateTagsMetadata()).toEqual({ title: dictionaries.en.nav.tags });
    const html = renderToStaticMarkup(await TagsPage({ searchParams: Promise.resolve({ mode: ['vndb', 'local'] }) }));

    expect(html).toContain('data-testid="tags-browser"');
    expect(html).toContain('&quot;lastUpdatedAt&quot;:123');
    expect(html).toContain('&quot;initialMode&quot;:&quot;vndb&quot;');
    expect(html).toContain('&quot;initialTree&quot;:{');
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /tag|%', 'tag_full:%']);
  });

  it('passes a null tree when scraping rejects', async () => {
    vi.mocked(getVndbTagHomeTree).mockRejectedValueOnce(new Error('offline'));
    const html = renderToStaticMarkup(await TagsPage({ searchParams: Promise.resolve({ mode: 'invalid' }) }));
    expect(html).toContain('&quot;initialMode&quot;:&quot;local&quot;');
    expect(html).toContain('&quot;initialTree&quot;:null');
  });
});

describe('labels page runtime', () => {
  it('renders metadata and rejects malformed id filters before reading the collection', async () => {
    expect(await generateLabelsMetadata()).toEqual({ title: dictionaries.en.labels.title });

    const html = renderToStaticMarkup(await LabelsPage({ searchParams: Promise.resolve({ ids: 'invalid' }) }));

    expect(html).toContain(dictionaries.en.labels.invalidIds);
    expect(listCollectionForCards).not.toHaveBeenCalled();
  });

  it('renders the empty state and passes normalized explicit ids into the card query', async () => {
    const html = renderToStaticMarkup(await LabelsPage({ searchParams: Promise.resolve({ ids: ' V1, v2, ', status: 'planning' }) }));

    expect(html).toContain(dictionaries.en.labels.empty);
    expect(listCollectionForCards).toHaveBeenCalledWith({ sort: 'title', vnIds: ['v1', 'v2'] });
  });

  it('filters status, renders QR fallback markup, and includes physical locations', async () => {
    vi.mocked(listCollectionForCards).mockReturnValue([
      card(1, { status: 'planning', physical_location: ['Shelf A', 'Box 2'] }),
      card(2, { status: 'completed' }),
    ]);
    qrMocks.toString.mockRejectedValueOnce(new Error('qr failed'));

    const html = renderToStaticMarkup(await LabelsPage({ searchParams: Promise.resolve({ status: 'planning' }) }));

    expect(html).toContain('Title 1');
    expect(html).not.toContain('Title 2');
    expect(html).toContain('Shelf A / Box 2');
    expect(html).toContain('<text x="2" y="14"');
    expect(qrMocks.toString).toHaveBeenCalledWith('https://library.example/vn/v1', expect.objectContaining({ type: 'svg' }));
  });

  it('caps explicit filters and printed labels while surfacing the truncation notice', async () => {
    const ids = Array.from({ length: 501 }, (_, index) => `v${index + 1}`).join(',');
    vi.mocked(listCollectionForCards).mockReturnValue(Array.from({ length: 201 }, (_, index) => card(index + 1)));

    const html = renderToStaticMarkup(await LabelsPage({ searchParams: Promise.resolve({ ids }) }));

    expect(vi.mocked(listCollectionForCards).mock.calls[0]?.[0]?.vnIds).toHaveLength(500);
    expect(html).toContain(dictionaries.en.labels.truncated.replace('{shown}', '200').replace('{total}', '201'));
    expect(qrMocks.toString).toHaveBeenCalledTimes(200);
  });
});
