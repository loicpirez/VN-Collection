// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './helpers/render-component';
import { TagsBrowser } from '@/components/TagsBrowser';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { VndbTag } from '@/lib/vndb-types';
import type { VndbTagHomeTree } from '@/lib/vndb-tag-web-parser';

let mockParams = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/tags',
  useSearchParams: () => mockParams,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

// This component relies on a real 300 ms search debounce, so each
// network-driven assertion polls via waitFor (capped at 3 s for genuine
// failures). Raise the per-test wall-clock budget above the 5 s default so
// scheduler contention under the parallel forks pool cannot trip a correct
// test before its 3 s waitFor settles.
vi.setConfig({ testTimeout: 15_000 });

function tag(over: Partial<VndbTag> = {}): VndbTag {
  return {
    id: 'g100',
    name: 'Tag Cont X',
    aliases: [],
    description: 'Desc X',
    category: 'cont',
    searchable: true,
    applicable: true,
    vn_count: 12,
    ...over,
  };
}

function href(id: string) {
  return `/tag/${id.toLowerCase()}?tab=vndb`;
}

function tree(): VndbTagHomeTree {
  return {
    groups: [
      {
        id: 'g1',
        label: 'Group One X',
        href: href('g1'),
        children: [
          { id: 'g11', name: 'Child A', href: href('g11'), count: 5 },
          { id: 'g12', name: 'Child B', href: href('g12') },
        ],
        moreCount: 3,
      },
      {
        id: 'g2',
        label: 'Group Two X',
        href: href('g2'),
        children: [{ id: 'g21', name: 'Child C', href: href('g21'), count: 1 }],
      },
    ],
    popular: [{ id: 'g30', name: 'Popular X', href: href('g30'), count: 99 }],
    recentlyAdded: [{ id: 'g40', name: 'Recent X', href: href('g40'), count: 2, dateLabel: '2024-05' }],
  };
}

/** Raw API JSON for /api/tags/web-tree that decodeTagHomeTreeResponse accepts. */
function treeApi(warning: string | null = null) {
  return {
    data: {
      groups: [
        {
          id: 'g1',
          label: 'Group One X',
          href: href('g1'),
          moreCount: 3,
          children: [
            { id: 'g11', name: 'Child A', href: href('g11'), count: 5 },
            { id: 'g12', name: 'Child B', href: href('g12') },
          ],
        },
        {
          id: 'g2',
          label: 'Group Two X',
          href: href('g2'),
          children: [{ id: 'g21', name: 'Child C', href: href('g21'), count: 1 }],
        },
      ],
      popular: [{ id: 'g30', name: 'Popular X', href: href('g30'), count: 99 }],
      recentlyAdded: [{ id: 'g40', name: 'Recent X', href: href('g40'), count: 2, dateLabel: '2024-05' }],
    },
    fetched_at: 1_700_000_000_000,
    stale: false,
    source_url: 'https://vndb.org/g',
    warning,
  };
}

function localTagsApi(tags: VndbTag[]) {
  return { tags };
}

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function jsonErr(status = 500, body: unknown = { error: 'boom' }): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  mockParams = new URLSearchParams();
  replaceMock.mockReset();
  vi.restoreAllMocks();
  global.fetch = vi.fn(async () => jsonOk(localTagsApi([]))) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Route a fetch by URL so each mode's two parallel calls resolve correctly. */
function routedFetch(map: { local?: unknown; tree?: unknown; tags?: unknown }) {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/collection/tags')) {
      return map.local instanceof Error ? Promise.reject(map.local) : jsonOk(map.local ?? localTagsApi([]));
    }
    if (url.startsWith('/api/tags/web-tree')) {
      return map.tree instanceof Error ? Promise.reject(map.tree) : jsonOk(map.tree ?? treeApi());
    }
    if (url.startsWith('/api/tags')) {
      return map.tags instanceof Error ? Promise.reject(map.tags) : jsonOk(map.tags ?? { tags: [] });
    }
    return jsonOk({});
  });
}

describe('TagsBrowser branches', () => {
  it('renders the local empty state after a resolved empty fetch', async () => {
    global.fetch = routedFetch({ local: localTagsApi([]) }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect(await screen.findByText(t.tags.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.tags.pageSubtitle)).toBeInTheDocument();
  });

  it('renders local tags as a flat card grid grouped by category', async () => {
    global.fetch = routedFetch({
      local: localTagsApi([
        tag({ id: 'g100', name: 'Content Tag X', category: 'cont', description: 'Synopsis One X' }),
        tag({ id: 'g200', name: 'Ero Tag X', category: 'ero', description: null }),
        tag({ id: 'g300', name: 'Tech Tag X', category: 'tech', description: 'Synopsis Two X' }),
      ]),
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect(await screen.findByText('Content Tag X')).toBeInTheDocument();
    expect(screen.getByText('Ero Tag X')).toBeInTheDocument();
    expect(screen.getByText('Tech Tag X')).toBeInTheDocument();
    // The cards with a description render the stripped synopsis.
    expect(screen.getByText('Synopsis One X')).toBeInTheDocument();
    expect(screen.getByText('Synopsis Two X')).toBeInTheDocument();
  });

  it('shows the error alert when the local tags fetch returns non-ok', async () => {
    global.fetch = routedFetch({ local: jsonErr(500, { error: 'tags-broke' }) as never }) as unknown as typeof fetch;
    // jsonErr is not an Error instance; route it directly.
    global.fetch = vi.fn(async () => jsonErr(500, { error: 'tags-broke' })) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('tags-broke');
  });

  it('shows the error alert when the local tags fetch rejects', async () => {
    global.fetch = vi.fn(async () => Promise.reject(new Error('network-down'))) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('network-down');
  });

  it('shows the error alert when the local decoder rejects the payload', async () => {
    // tags is not an array => decodeTagsResponse returns null => generic error.
    global.fetch = vi.fn(async () => jsonOk({ tags: 'not-an-array' })) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('filters local tags by the committed query', async () => {
    global.fetch = routedFetch({
      local: localTagsApi([
        tag({ id: 'g100', name: 'Alpha X', category: 'cont' }),
        tag({ id: 'g200', name: 'Beta X', category: 'ero' }),
      ]),
    }) as unknown as typeof fetch;
    const { user: u } = renderWithProviders(<TagsBrowser />, { locale: 'en' });
    // Initial local fetch (0ms) resolves and both cards render.
    await waitFor(() => expect(screen.getByText('Alpha X')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Beta X')).toBeInTheDocument();

    const input = screen.getByLabelText(t.tags.searchPlaceholder);
    await u.type(input, 'alpha');
    // Commit debounce (300ms) then the local fetch + name filter applies.
    // Assert the settled state (Alpha present AND Beta gone) in one poll so
    // the transient loading-skeleton phase cannot trip the assertion.
    await waitFor(() => {
      expect(screen.getByText('Alpha X')).toBeInTheDocument();
      expect(screen.queryByText('Beta X')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('filters local tags by the selected category', async () => {
    global.fetch = routedFetch({
      local: localTagsApi([
        tag({ id: 'g100', name: 'Cont Only X', category: 'cont' }),
        tag({ id: 'g200', name: 'Ero Only X', category: 'ero' }),
      ]),
    }) as unknown as typeof fetch;
    const { user: u } = renderWithProviders(<TagsBrowser />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('Cont Only X')).toBeInTheDocument(), { timeout: 3000 });

    await u.selectOptions(screen.getByLabelText(t.tags.categoryFilter), 'ero');
    // The local category filter drops the cont-category tag once the
    // refetch settles. Assert the settled state in one poll.
    await waitFor(() => {
      expect(screen.getByText('Ero Only X')).toBeInTheDocument();
      expect(screen.queryByText('Cont Only X')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('uses the SSR tree without fetching the web-tree when initialTree is provided in vndb mode', async () => {
    const fetchMock = routedFetch({ local: localTagsApi([tag({ id: 'g11', name: 'Child A', vn_count: 7 })]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" initialTree={tree()} />, { locale: 'en' });
    // Tree groups render immediately from SSR data.
    expect(await screen.findByText('Group One X')).toBeInTheDocument();
    expect(screen.getByText(t.tags.tagTree)).toBeInTheDocument();
    expect(screen.getByText(t.tags.popularTags)).toBeInTheDocument();
    expect(screen.getByText(t.tags.recentlyAdded)).toBeInTheDocument();
    // The local counts fetch fires, but the web-tree fetch is skipped.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.startsWith('/api/tags/web-tree'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/collection/tags'))).toBe(true);
  });

  it('collapses and expands a root group row in the tree', async () => {
    const u = userEvent.setup();
    global.fetch = routedFetch({ local: localTagsApi([]) }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" initialTree={tree()} />, { locale: 'en' });
    expect(await screen.findByText('Child A')).toBeInTheDocument();
    const groupBtn = screen.getByRole('button', { name: /Group One X/ });
    expect(groupBtn).toHaveAttribute('aria-expanded', 'true');
    await u.click(groupBtn);
    expect(groupBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Child A')).not.toBeInTheDocument();
    await u.click(groupBtn);
    expect(screen.getByText('Child A')).toBeInTheDocument();
  });

  it('fetches the web-tree, merges local counts, and shows the stale warning', async () => {
    global.fetch = routedFetch({
      // A non-empty local list exercises the local-count merge loop in the
      // VNDB-browse path; the matching id surfaces an in-collection badge.
      local: localTagsApi([tag({ id: 'g11', name: 'Child A', category: 'cont', vn_count: 4 })]),
      tree: treeApi('cache is stale'),
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    // VNDB browse has a 300ms debounce before the fetch fires.
    await waitFor(() => expect(screen.getByText('Group One X')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(t.tags.staleHierarchy)).toBeInTheDocument();
    // The local count (4) renders as a chip on the matching tree chip.
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows the error alert when the web-tree fetch is not ok', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api/tags/web-tree')) return jsonErr(503, { error: 'tree-down' });
      return jsonOk(localTagsApi([]));
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent('tree-down');
  });

  it('refreshes the hierarchy with force=1 when the refresh button is clicked', async () => {
    const fetchMock = routedFetch({ local: localTagsApi([]), tree: treeApi() });
    global.fetch = fetchMock as unknown as typeof fetch;
    const u = userEvent.setup();
    renderWithProviders(<TagsBrowser initialMode="vndb" initialTree={tree()} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('Group One X')).toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: t.tags.refreshHierarchy }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls.some((url) => url.includes('/api/tags/web-tree?force=1'))).toBe(true);
    }, { timeout: 3000 });
  });

  it('runs the vndb search path when a query is active in vndb mode', async () => {
    // The flat view re-filters by the query (name substring), so the
    // returned tag name must contain the query token.
    mockParams = new URLSearchParams('mode=vndb&q=alpha&category=cont');
    const fetchMock = routedFetch({
      local: localTagsApi([tag({ id: 'g100', name: 'alpha Local Hit', vn_count: 4 })]),
      tags: { tags: [tag({ id: 'g100', name: 'alpha Searched Tag X', category: 'cont', vn_count: 8 })] },
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('alpha Searched Tag X')).toBeInTheDocument(), { timeout: 3000 });
    // The vndb-mode card shows the in-collection chip when localCounts has the id.
    expect(screen.getByText(new RegExp(t.tags.inCollection))).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((url) => url.startsWith('/api/tags?results=100') && url.includes('category=cont') && url.includes('q=alpha'))).toBe(true);
  });

  it('shows the error alert when the vndb search fetch is not ok', async () => {
    mockParams = new URLSearchParams('mode=vndb&q=alpha');
    global.fetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api/tags?')) return jsonErr(500, { error: 'search-down' });
      return jsonOk(localTagsApi([]));
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent('search-down');
  });

  it('shows the generic error when the web-tree decoder rejects the payload', async () => {
    global.fetch = vi.fn(async (url: string) => {
      // ok response but a structurally invalid tree => decoder returns null.
      if (url.startsWith('/api/tags/web-tree')) return jsonOk({ data: { groups: 'bad' }, fetched_at: 1, stale: false, source_url: 'x' });
      return jsonOk(localTagsApi([]));
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent(t.common.error);
  });

  it('shows the generic error when the vndb search decoder rejects the payload', async () => {
    mockParams = new URLSearchParams('mode=vndb&q=alpha');
    global.fetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api/tags?')) return jsonOk({ tags: 'not-an-array' });
      return jsonOk(localTagsApi([]));
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser initialMode="vndb" />, { locale: 'en' });
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent(t.common.error);
  });

  it('renders the external per-card VNDB link with a stop-propagation handler', async () => {
    const u = userEvent.setup();
    global.fetch = routedFetch({
      local: localTagsApi([tag({ id: 'g100', name: 'Linked Tag X', category: 'cont' })]),
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('Linked Tag X')).toBeInTheDocument(), { timeout: 3000 });
    // The card's external link carries the VNDB detail label and href.
    const ext = screen.getByRole('link', { name: t.detail.viewOnVndb });
    expect(ext).toHaveAttribute('href', 'https://vndb.org/g100');
    // Clicking it fires the stop-propagation onClick handler.
    await u.click(ext);
  });

  it('switches mode with the tab list and arrow keys', async () => {
    const u = userEvent.setup();
    global.fetch = routedFetch({ local: localTagsApi([]) }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    await screen.findByText(t.tags.emptyTitle);

    const localTab = screen.getByRole('tab', { name: t.tags.tabLocal });
    const vndbTab = screen.getByRole('tab', { name: t.tags.tabVndb });
    expect(localTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(t.tags.pageSubtitle)).toBeInTheDocument();

    // Clicking the VNDB tab link switches mode and updates the subtitle hint.
    await u.click(vndbTab);
    await waitFor(() => expect(vndbTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText(t.tags.vndbTabHint)).toBeInTheDocument();
    // Clicking the Local tab link runs its switchMode('local') onClick.
    await u.click(localTab);
    await waitFor(() => expect(localTab).toHaveAttribute('aria-selected', 'true'));
    // Re-open VNDB for the keyboard navigation below.
    await u.click(vndbTab);
    await waitFor(() => expect(vndbTab).toHaveAttribute('aria-selected', 'true'));

    const tablist = screen.getByRole('tablist');
    // ArrowLeft from vndb -> local.
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    await waitFor(() => expect(localTab).toHaveAttribute('aria-selected', 'true'));
    // End -> vndb.
    fireEvent.keyDown(tablist, { key: 'End' });
    await waitFor(() => expect(vndbTab).toHaveAttribute('aria-selected', 'true'));
    // Home -> local.
    fireEvent.keyDown(tablist, { key: 'Home' });
    await waitFor(() => expect(localTab).toHaveAttribute('aria-selected', 'true'));
    // ArrowRight from local -> vndb.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    await waitFor(() => expect(vndbTab).toHaveAttribute('aria-selected', 'true'));
    // A non-handled key returns early without changing selection.
    fireEvent.keyDown(tablist, { key: 'Enter' });
    expect(vndbTab).toHaveAttribute('aria-selected', 'true');
  });

  it('syncs q and category into the URL via router.replace', async () => {
    const u = userEvent.setup();
    global.fetch = routedFetch({ local: localTagsApi([]) }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    await screen.findByText(t.tags.emptyTitle);

    await u.type(screen.getByLabelText(t.tags.searchPlaceholder), 'omega');
    await waitFor(() => {
      const lastQ = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
      expect(lastQ).toContain('q=omega');
    }, { timeout: 3000 });

    // Select a category to set category= and trigger another replace.
    replaceMock.mockClear();
    await u.selectOptions(screen.getByLabelText(t.tags.categoryFilter), 'ero');
    await waitFor(() => {
      const last = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last).toContain('category=ero');
    }, { timeout: 3000 });
  });

  it('removes q and category from the URL when both are cleared', async () => {
    mockParams = new URLSearchParams('q=foo&category=ero');
    const u = userEvent.setup();
    global.fetch = routedFetch({
      local: localTagsApi([tag({ id: 'g200', name: 'foo Ero X', category: 'ero' })]),
    }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    const input = screen.getByLabelText(t.tags.searchPlaceholder) as HTMLInputElement;
    expect(input.value).toBe('foo');

    // Clearing the committed query deletes q= from the URL.
    await u.clear(input);
    await waitFor(() => {
      const last = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last).toBeDefined();
      expect(last).not.toContain('q=');
    }, { timeout: 3000 });

    // Resetting the category select to "all" deletes category= from the URL.
    replaceMock.mockClear();
    await u.selectOptions(screen.getByLabelText(t.tags.categoryFilter), '');
    await waitFor(() => {
      const last = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last).toBeDefined();
      expect(last).not.toContain('category=');
    }, { timeout: 3000 });
  });

  it('hydrates initial q and category from the search params', async () => {
    mockParams = new URLSearchParams('q=preset&category=tech');
    global.fetch = routedFetch({ local: localTagsApi([tag({ id: 'g300', name: 'Preset Match', category: 'tech' })]) }) as unknown as typeof fetch;
    renderWithProviders(<TagsBrowser />, { locale: 'en' });
    expect((screen.getByLabelText(t.tags.searchPlaceholder) as HTMLInputElement).value).toBe('preset');
    expect((screen.getByLabelText(t.tags.categoryFilter) as HTMLSelectElement).value).toBe('tech');
  });
});
