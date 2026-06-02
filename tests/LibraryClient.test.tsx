// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';

let searchParamsValue = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Cheap card stub so the heavy real VnCard tree stays out of the suite. */
vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: { id: string; title: string } }) => (
    <div data-testid="vncard" data-id={data.id}>{data.title}</div>
  ),
}));

import { LibraryClient } from '@/components/LibraryClient';

/** A row that satisfies the strict decodeCollectionCardItem guard. */
function cardRow(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
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
    fetched_at: 1000,
    has_notes: false,
    list_count: 0,
    in_reading_queue: false,
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface RouterOptions {
  collectionItems?: ReturnType<typeof cardRow>[];
  collectionStatus?: number;
  total?: number;
}

/** Route every endpoint LibraryClient touches to a valid decoder shape. */
function installFetchRouter(opts: RouterOptions = {}) {
  const items = opts.collectionItems ?? [];
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/settings')) {
      return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
    }
    if (url.startsWith('/api/producers')) {
      return Promise.resolve(json({ producers: [], publishers: [] }));
    }
    if (url.startsWith('/api/series')) {
      return Promise.resolve(json({ series: [] }));
    }
    if (url.startsWith('/api/places')) {
      return Promise.resolve(json({ known_places: [] }));
    }
    if (url.startsWith('/api/collection/tags')) {
      return Promise.resolve(json({ tags: [] }));
    }
    if (url.startsWith('/api/collection')) {
      if (opts.collectionStatus && opts.collectionStatus >= 400) {
        return Promise.resolve(json({ error: 'collection boom' }, opts.collectionStatus));
      }
      return Promise.resolve(json({
        items,
        stats: { total: opts.total ?? items.length, byStatus: [], playtime_minutes: 0 },
        pagination: { page: 1, page_size: 240, returned: items.length, has_more: false },
      }));
    }
    return Promise.resolve(json({}));
  });
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  installFetchRouter();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LibraryClient', () => {
  it('shows a loading skeleton on first paint then renders the fetched cards', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y'), cardRow('v90002', 'Title Z')] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    const cards = await screen.findAllByTestId('vncard');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Title Y')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/collection?'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('renders the empty-collection state after a resolved zero-result fetch', async () => {
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByRole('heading', { name: 'Empty collection' })).toBeInTheDocument();
    expect(screen.getByText('Add your first VN from the search page.')).toBeInTheDocument();
  });

  it('shows a filtered empty-state description when a filter is active', async () => {
    searchParamsValue = new URLSearchParams('status=completed');
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByRole('heading', { name: 'Empty collection' })).toBeInTheDocument();
    expect(screen.getByText('No result with these filters.')).toBeInTheDocument();
  });

  it('surfaces the collection error alert when the request fails', async () => {
    installFetchRouter({ collectionStatus: 500 });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByText('collection boom')).toBeInTheDocument();
  });

  it('renders the toolbar search box in full mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    expect(container.querySelector('input[data-vn-search]')).not.toBeNull();
  });

  it('omits the grid in controls-only mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="controls-only" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/collection?'),
      expect.anything(),
    ));
    expect(container.querySelector('input[data-vn-search]')).not.toBeNull();
    expect(screen.queryByTestId('vncard')).not.toBeInTheDocument();
  });

  it('omits the toolbar search box in grid-only mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="grid-only" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByTestId('vncard')).toBeInTheDocument();
    expect(container.querySelector('input[data-vn-search]')).toBeNull();
  });

  it('forwards active URL filters into the collection request', async () => {
    searchParamsValue = new URLSearchParams('producer=p90001&q=hello');
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/api/collection?'),
      );
      expect(call).toBeTruthy();
      expect(call![0]).toContain('producer=p90001');
      expect(call![0]).toContain('q=hello');
    });
  });

  it('renders the status filter chips with the total on the All chip', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')], total: 7 });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    const allChip = within(group).getByRole('button', { name: /All/ });
    expect(allChip).toHaveTextContent('7');
    expect(allChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('pushes a status filter into the URL when a status chip is clicked', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    await user.click(within(group).getByRole('button', { name: /Completed/ }));
    expect(replaceMock).toHaveBeenCalledWith('/?status=completed', { scroll: false });
  });

  it('clears the status filter back to the bare route when the active chip is reclicked', async () => {
    searchParamsValue = new URLSearchParams('status=completed');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    await user.click(within(group).getByRole('button', { name: /Completed/ }));
    expect(replaceMock).toHaveBeenCalledWith('/', { scroll: false });
  });
});
