// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Providers, renderWithProviders } from './helpers/render-component';
import SteamSyncPage from '@/app/steam/page';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

interface FetchConfig {
  sync?: unknown;
  syncStatus?: number;
  library?: unknown;
  libraryStatus?: number;
  links?: unknown;
  linksStatus?: number;
  applied?: unknown;
  appliedStatus?: number;
  linkMutation?: unknown;
  linkMutationStatus?: number;
  unlinkMutation?: unknown;
  unlinkMutationStatus?: number;
  find?: unknown;
  findStatus?: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function suggestion() {
  return {
    vn_id: 'v90001',
    vn_title: 'Suggested VN',
    steam_appid: 101,
    steam_name: 'Steam title',
    current_minutes: 60,
    steam_minutes: 180,
    delta: 120,
  };
}

function link(source: 'auto' | 'manual' = 'manual') {
  return {
    vn_id: source === 'manual' ? 'v90001' : 'v90002',
    appid: source === 'manual' ? 101 : 102,
    steam_name: source === 'manual' ? 'Manual Steam title' : 'Auto Steam title',
    source,
    last_synced_minutes: null,
    created_at: 1,
    updated_at: 1,
  };
}

function unlinked(appid: number) {
  return {
    appid,
    name: `Unlinked Steam ${appid}`,
    minutes: appid,
  };
}

function findMatch() {
  return {
    id: 'v90003',
    title: 'Matched VN',
    alttitle: 'Alternative matched title',
    image_url: null,
    image_thumb: null,
    local_image: null,
    local_image_thumb: null,
    image_sexual: null,
  };
}

function routedFetch(config: FetchConfig = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/collection/find')) return json(config.find ?? { matches: [] }, config.findStatus);
    if (url === '/api/steam/sync' && method === 'POST') return json(config.applied ?? { applied: 1 }, config.appliedStatus);
    if (url === '/api/steam/sync') return json(config.sync ?? { ok: true, suggestions: [] }, config.syncStatus);
    if (url === '/api/steam/library') return json(config.library ?? { ok: true, games: [] }, config.libraryStatus);
    if (url === '/api/steam/link' && method === 'POST') return json(config.linkMutation ?? { ok: true }, config.linkMutationStatus);
    if (url.startsWith('/api/steam/link?') && method === 'DELETE') return json(config.unlinkMutation ?? { ok: true }, config.unlinkMutationStatus);
    if (url === '/api/steam/link') return json(config.links ?? { links: [] }, config.linksStatus);
    return json({});
  });
}

beforeEach(() => {
  refresh.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = routedFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Steam sync page runtime', () => {
  it('renders loading skeletons before the empty resolved state', async () => {
    renderWithProviders(<SteamSyncPage />, { locale: 'en' });

    expect(screen.getAllByText('Pending suggestions')).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('No playtime updates pending.')).toBeInTheDocument());
    expect(screen.getByText('No Steam games to map. Set the API key + SteamID in settings.')).toBeInTheDocument();
  });

  it('renders the structured not-configured error with a settings affordance', async () => {
    global.fetch = routedFetch({
      sync: { ok: false, error: 'Steam missing', code: 'steam_not_configured' },
      library: { ok: false, error: 'Library unavailable' },
    });

    renderWithProviders(<SteamSyncPage />, { locale: 'en' });

    expect(await screen.findByText('Steam missing')).toBeInTheDocument();
    expect(screen.getByText('To configure Steam, open')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Data/ }).length).toBeGreaterThan(0);
  });

  it('reports malformed refresh responses and link-list HTTP errors', async () => {
    global.fetch = routedFetch({ sync: { invalid: true } });
    const first = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
    first.unmount();

    global.fetch = routedFetch({ links: { error: 'Links unavailable' }, linksStatus: 503 });
    renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    expect(await screen.findByText('Links unavailable')).toBeInTheDocument();
  });

  it('reports library errors while preserving a valid sync preview', async () => {
    global.fetch = routedFetch({
      library: { ok: false, error: 'Library unavailable' },
    });

    renderWithProviders(<SteamSyncPage />, { locale: 'en' });

    expect(await screen.findByText('Library unavailable')).toBeInTheDocument();
  });

  it('uses the localized fallback for an incomplete sync error and a rejected refresh', async () => {
    global.fetch = routedFetch({
      sync: { ok: false },
    });
    const first = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
    first.unmount();

    global.fetch = vi.fn(async () => {
      throw 'refresh failed';
    });
    renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
  });

  it('aborts pending refresh requests when the page unmounts', async () => {
    const pending = deferred<Response>();
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => pending.reject(new Error('aborted')));
      return pending.promise;
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    view.unmount();

    await waitFor(() => expect(vi.mocked(console.error)).not.toHaveBeenCalled());
  });

  it('settles resolved refresh responses without publishing after unmount', async () => {
    const sync = deferred<Response>();
    const library = deferred<Response>();
    const links = deferred<Response>();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/steam/sync') return sync.promise;
      if (url === '/api/steam/library') return library.promise;
      return links.promise;
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    view.unmount();
    sync.resolve(json({ ok: true, suggestions: [] }));
    library.resolve(json({ ok: true, games: [] }));
    links.resolve(json({ links: [] }));

    await Promise.all([sync.promise, library.promise, links.promise]);
  });

  it('allows a locale change to replace an obsolete pending refresh', async () => {
    const oldSync = deferred<Response>();
    const oldLibrary = deferred<Response>();
    const oldLinks = deferred<Response>();
    let pendingLocaleRefresh = true;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (pendingLocaleRefresh) {
        if (url === '/api/steam/sync') return oldSync.promise;
        if (url === '/api/steam/library') return oldLibrary.promise;
        return oldLinks.promise;
      }
      if (url === '/api/steam/sync') return Promise.resolve(json({ ok: true, suggestions: [] }));
      if (url === '/api/steam/library') return Promise.resolve(json({ ok: true, games: [] }));
      return Promise.resolve(json({ links: [] }));
    });

    const view = render(<Providers locale="en"><SteamSyncPage /></Providers>);
    pendingLocaleRefresh = false;
    view.rerender(<Providers locale="ja"><SteamSyncPage /></Providers>);
    oldSync.resolve(json({ ok: true, suggestions: [] }));
    oldLibrary.resolve(json({ ok: true, games: [] }));
    oldLinks.resolve(json({ links: [] }));

    await waitFor(() => expect(screen.getByText('適用待ちの提案')).toBeInTheDocument());
  });

  it('renders suggestions and stored link source labels, then applies selected playtime', async () => {
    global.fetch = routedFetch({
      sync: { ok: true, suggestions: [suggestion()] },
      links: { links: [link('manual'), link('auto')] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });

    expect(await screen.findByText('Suggested VN')).toBeInTheDocument();
    expect(screen.getByText('Manual Steam title')).toBeInTheDocument();
    expect(screen.getByText('Auto Steam title')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('auto')).toBeInTheDocument();
    expect(screen.getByText('1 selected / +2h')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply (1)' }));

    expect(await screen.findByText('Updated 1 VNs')).toBeInTheDocument();
    const post = vi.mocked(global.fetch).mock.calls.find(([input, init]) => String(input) === '/api/steam/sync' && init?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      applies: [{ vn_id: 'v90001', playtime_minutes: 180 }],
    });
  });

  it('toggles and clears suggestion picks without applying an empty selection', async () => {
    global.fetch = routedFetch({
      sync: { ok: true, suggestions: [suggestion()] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const suggestionRow = await screen.findByRole('button', { name: /Suggested VN/ });
    await user.click(suggestionRow);
    expect(screen.getByText('0 selected / +0min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply (0)' })).toBeDisabled();

    await user.click(suggestionRow);
    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.getByRole('button', { name: 'Apply (0)' })).toBeDisabled();
  });

  it('reports rejected and malformed playtime mutations', async () => {
    global.fetch = routedFetch({
      sync: { ok: true, suggestions: [suggestion()] },
      applied: { error: 'Apply failed' },
      appliedStatus: 503,
    });
    const first = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Suggested VN');
    await first.user.click(screen.getByRole('button', { name: 'Apply (1)' }));
    expect(await screen.findByText('Apply failed')).toBeInTheDocument();
    first.unmount();

    global.fetch = routedFetch({
      sync: { ok: true, suggestions: [suggestion()] },
      applied: { invalid: true },
    });
    const second = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Suggested VN');
    await second.user.click(screen.getByRole('button', { name: 'Apply (1)' }));
    expect(await screen.findByText('Error')).toBeInTheDocument();
  });

  it('does not publish a playtime mutation after the page unmounts', async () => {
    const pendingApply = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync' && init?.method === 'POST') return pendingApply.promise;
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [suggestion()] });
      if (url === '/api/steam/library') return json({ ok: true, games: [] });
      if (url === '/api/steam/link') return json({ links: [] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Suggested VN');
    await view.user.click(screen.getByRole('button', { name: 'Apply (1)' }));
    view.unmount();
    pendingApply.resolve(json({ applied: 1 }));

    await pendingApply.promise;
  });

  it('ignores a rejected playtime mutation after the page unmounts', async () => {
    const pendingApply = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync' && init?.method === 'POST') return pendingApply.promise;
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [suggestion()] });
      if (url === '/api/steam/library') return json({ ok: true, games: [] });
      if (url === '/api/steam/link') return json({ links: [] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Suggested VN');
    await view.user.click(screen.getByRole('button', { name: 'Apply (1)' }));
    view.unmount();
    pendingApply.reject(new Error('late apply rejection'));
    await expect(pendingApply.promise).rejects.toThrow('late apply rejection');
  });

  it('searches the collection and creates a sticky manual link', async () => {
    global.fetch = routedFetch({
      library: { ok: true, games: [unlinked(201)] },
      find: { matches: [findMatch()] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await user.type(input, 'match');
    const result = await screen.findByRole('button', { name: /Matched VN/ });
    expect(result).toHaveTextContent('Alternative matched title');

    await user.click(result);

    expect(await screen.findByText('Link created')).toBeInTheDocument();
    const post = vi.mocked(global.fetch).mock.calls.find(([inputValue, init]) => String(inputValue) === '/api/steam/link' && init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      vn_id: 'v90003',
      appid: 201,
      steam_name: 'Unlinked Steam 201',
    });
  });

  it('clears collection matches for a blank query and reports search failures', async () => {
    global.fetch = routedFetch({
      library: { ok: true, games: [unlinked(201)] },
      find: { matches: [findMatch()] },
    });

    const first = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const firstInput = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await first.user.type(firstInput, 'match');
    expect(await screen.findByText('Matched VN')).toBeInTheDocument();
    await first.user.clear(firstInput);
    expect(screen.queryByText('Matched VN')).toBeNull();
    first.unmount();

    global.fetch = routedFetch({
      library: { ok: true, games: [unlinked(202)] },
      find: { error: 'Search failed' },
      findStatus: 503,
    });
    const second = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const secondInput = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await second.user.type(secondInput, 'x');
    expect(await screen.findByText('Search failed')).toBeInTheDocument();
    second.unmount();

    global.fetch = routedFetch({
      library: { ok: true, games: [unlinked(203)] },
      find: { invalid: true },
    });
    const third = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const thirdInput = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await third.user.type(thirdInput, 'x');
    expect(await screen.findByText('Error')).toBeInTheDocument();
  });

  it('discards stale collection searches', async () => {
    const firstFind = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [unlinked(201)] });
      if (url === '/api/steam/link') return json({ links: [] });
      if (url === '/api/collection/find?q=a') return firstFind.promise;
      if (url === '/api/collection/find?q=ab') return json({ matches: [findMatch()] });
      return json({});
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await user.type(input, 'ab');
    expect(await screen.findByText('Matched VN')).toBeInTheDocument();
    firstFind.resolve(json({ matches: [] }));
    await firstFind.promise;
    expect(screen.getByText('Matched VN')).toBeInTheDocument();
  });

  it('aborts a pending collection search when the page unmounts', async () => {
    const pendingFind = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [unlinked(201)] });
      if (url === '/api/steam/link') return json({ links: [] });
      if (url.startsWith('/api/collection/find')) return pendingFind.promise;
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await view.user.type(input, 'x');
    view.unmount();
    pendingFind.resolve(json({ matches: [findMatch()] }));
    await pendingFind.promise;
  });

  it('ignores an aborted collection-search rejection and localizes an empty search error', async () => {
    const firstFind = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [unlinked(201)] });
      if (url === '/api/steam/link') return json({ links: [] });
      if (url === '/api/collection/find?q=a') {
        init?.signal?.addEventListener('abort', () => firstFind.reject(new Error('aborted')));
        return firstFind.promise;
      }
      if (url === '/api/collection/find?q=ab') throw new Error('');
      return json({});
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await user.type(input, 'ab');

    expect(await screen.findByText('Error')).toBeInTheDocument();
  });

  it('reports failed manual links', async () => {
    global.fetch = routedFetch({
      library: { ok: true, games: [unlinked(201)] },
      find: { matches: [findMatch()] },
      linkMutation: { error: 'Link failed' },
      linkMutationStatus: 503,
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await user.type(input, 'match');
    await user.click(await screen.findByRole('button', { name: /Matched VN/ }));

    expect(await screen.findByText('Link failed')).toBeInTheDocument();
  });

  it('does not publish a manual link after the page unmounts', async () => {
    const pendingLink = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [unlinked(201)] });
      if (url === '/api/steam/link' && init?.method === 'POST') return pendingLink.promise;
      if (url === '/api/steam/link') return json({ links: [] });
      if (url.startsWith('/api/collection/find')) return json({ matches: [findMatch()] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await view.user.type(input, 'match');
    await view.user.click(await screen.findByRole('button', { name: /Matched VN/ }));
    view.unmount();
    pendingLink.resolve(json({ ok: true }));
    await pendingLink.promise;
  });

  it('ignores a rejected manual link after the page unmounts', async () => {
    const pendingLink = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [unlinked(201)] });
      if (url === '/api/steam/link' && init?.method === 'POST') return pendingLink.promise;
      if (url === '/api/steam/link') return json({ links: [] });
      if (url.startsWith('/api/collection/find')) return json({ matches: [findMatch()] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await view.user.type(input, 'match');
    await view.user.click(await screen.findByRole('button', { name: /Matched VN/ }));
    view.unmount();
    pendingLink.reject(new Error('late link rejection'));
    await expect(pendingLink.promise).rejects.toThrow('late link rejection');
  });

  it('confirms and removes an existing link', async () => {
    global.fetch = routedFetch({
      links: { links: [link('manual')] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Manual Steam title');
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Link removed')).toBeInTheDocument();
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith('/api/steam/link?vn_id=v90001', expect.objectContaining({ method: 'DELETE' }));
  });

  it('keeps an existing link when unlink confirmation is cancelled', async () => {
    global.fetch = routedFetch({
      links: { links: [link('manual')] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Manual Steam title');
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Manual Steam title')).toBeInTheDocument();
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalledWith('/api/steam/link?vn_id=v90001', expect.objectContaining({ method: 'DELETE' }));
  });

  it('reports failed unlinks', async () => {
    global.fetch = routedFetch({
      links: { links: [link('manual')] },
      unlinkMutation: { error: 'Unlink failed' },
      unlinkMutationStatus: 503,
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Manual Steam title');
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Unlink failed')).toBeInTheDocument();
  });

  it('shows unlink progress and does not publish completion after unmount', async () => {
    const pendingUnlink = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [] });
      if (url.startsWith('/api/steam/link?') && init?.method === 'DELETE') return pendingUnlink.promise;
      if (url === '/api/steam/link') return json({ links: [link('manual')] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Manual Steam title');
    await view.user.click(screen.getByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('alertdialog');
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlink' }).querySelector('.animate-spin')).not.toBeNull());
    view.unmount();
    pendingUnlink.resolve(json({ ok: true }));
    await pendingUnlink.promise;
  });

  it('ignores a rejected unlink after the page unmounts', async () => {
    const pendingUnlink = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/steam/sync') return json({ ok: true, suggestions: [] });
      if (url === '/api/steam/library') return json({ ok: true, games: [] });
      if (url.startsWith('/api/steam/link?') && init?.method === 'DELETE') return pendingUnlink.promise;
      if (url === '/api/steam/link') return json({ links: [link('manual')] });
      return json({});
    });

    const view = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    await screen.findByText('Manual Steam title');
    await view.user.click(screen.getByRole('button', { name: 'Unlink' }));
    await view.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }));
    view.unmount();
    pendingUnlink.reject(new Error('late unlink rejection'));
    await expect(pendingUnlink.promise).rejects.toThrow('late unlink rejection');
  });

  it('rejects overlapping mutations while an unlink confirmation owns the slot', async () => {
    global.fetch = routedFetch({
      sync: { ok: true, suggestions: [suggestion()] },
      library: { ok: true, games: [unlinked(201)] },
      links: { links: [link('manual'), link('auto')] },
      find: { matches: [findMatch()] },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const input = await screen.findByRole('searchbox', { name: 'Search the collection...' });
    await user.type(input, 'match');
    const unlinkButtons = screen.getAllByRole('button', { name: 'Unlink' });
    await user.click(unlinkButtons[0]!);
    const dialog = await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Apply (1)' }));
    await user.click(screen.getByRole('button', { name: /Matched VN/ }));
    await user.click(unlinkButtons[1]!);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('expands and collapses Steam libraries beyond the 60-row preview', async () => {
    global.fetch = routedFetch({
      library: { ok: true, games: Array.from({ length: 61 }, (_unused, index) => unlinked(index + 1)) },
    });

    const { user } = renderWithProviders(<SteamSyncPage />, { locale: 'en' });
    const expand = await screen.findByRole('button', { name: 'Show all (1)' });
    expect(screen.queryByText('Unlinked Steam 61')).toBeNull();

    await user.click(expand);
    expect(screen.getByText('Unlinked Steam 61')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Unlinked Steam 61')).toBeNull();
  });
});
