// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { WishlistClient } from '@/components/WishlistClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { WishlistClientItem, WishlistClientState } from '@/lib/vndb-ui-client-shape';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: nav.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/wishlist',
  useSearchParams: () => nav.searchParams,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({
    data, onRemoveFromWishlist, onSelect, removingFromWishlist, selectable,
  }: {
    data: { id: string; title: string };
    onRemoveFromWishlist?: () => void | Promise<void>;
    onSelect?: () => void;
    removingFromWishlist?: boolean;
    selectable?: boolean;
  }) => (
    <article data-testid={`wishlist-card-${data.id}`}>
      <h3>{data.title}</h3>
      {selectable ? (
        <button type="button" onClick={onSelect}>{`Select ${data.title}`}</button>
      ) : (
        <button type="button" disabled={removingFromWishlist} onClick={() => void onRemoveFromWishlist?.()}>{`Remove ${data.title}`}</button>
      )}
    </article>
  ),
}));

vi.mock('@/components/BulkDownloadButton', () => ({
  BulkDownloadButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function item(id: string, title: string, overrides: Partial<WishlistClientItem> = {}): WishlistClientItem {
  return {
    id, added: 1700000000, voted: null, vote: null, started: null, finished: null, notes: null,
    labels: [{ id: 7, label: 'Wishlist' }], in_collection: false,
    egs: { median: 70, playtime_median_minutes: 600 },
    vn: {
      id, title, alttitle: null, released: '2020-01-02', rating: 78, votecount: 100, length_minutes: 600,
      languages: ['en'], platforms: ['win'],
      image: { url: 'https://img.invalid/full.jpg', thumbnail: 'https://img.invalid/thumb.jpg', sexual: 0 },
      developers: [{ id: 'p90001', name: 'Studio One' }],
    },
    ...overrides,
  };
}

function state(items: WishlistClientItem[], overrides: Partial<WishlistClientState> = {}): WishlistClientState {
  return { needsAuth: false, items, ...overrides };
}

function renderWishlist() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <WishlistClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.refresh.mockClear();
  nav.searchParams = new URLSearchParams('hideOwned=0');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WishlistClient branches', () => {
  function installFetch(payload: WishlistClientState) {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(payload);
      if (url.startsWith('/api/wishlist/') && init?.method === 'DELETE') return json({ ok: true });
      return json({ ok: true });
    });
  }

  it.each(['added_asc', 'rating_desc', 'released_desc', 'released_asc', 'length_desc', 'egs_rating_desc', 'title'])(
    'orders cards under the %s sort branch',
    async (sortMode) => {
      // sort is URL-derived; the mocked router never mutates it, so seed it.
      nav.searchParams = new URLSearchParams(`hideOwned=0&sort=${sortMode}`);
      const rows = [
        item('v90001', 'Beta', { added: 100, egs: { median: 50, playtime_median_minutes: 100 }, vn: { ...item('v90001', 'Beta').vn, rating: 60, released: '2018-01-01', length_minutes: 200 } }),
        item('v90002', 'Alpha', { added: 300, egs: { median: 90, playtime_median_minutes: 800 }, vn: { ...item('v90002', 'Alpha').vn, rating: 90, released: '2022-01-01', length_minutes: 900 } }),
      ];
      installFetch(state(rows));
      renderWishlist();
      await screen.findByText('Alpha');
      expect(screen.getByText('Beta')).toBeInTheDocument();
    },
  );

  it.each(['year', 'language', 'platform', 'status', 'developer'])(
    'groups by %s (with unknown fallbacks) rendering group headings',
    async (groupMode) => {
      // The mocked router never mutates searchParams, so seed the group up-front.
      nav.searchParams = new URLSearchParams(`hideOwned=0&group=${groupMode}`);
      const rows = [
        item('v90001', 'HasMeta', { in_collection: true }),
        item('v90002', 'NoMeta', {
          in_collection: false,
          vn: { ...item('v90002', 'NoMeta').vn, released: null, languages: [], platforms: [], developers: [] },
        }),
      ];
      installFetch(state(rows));
      renderWishlist();
      await screen.findByText('HasMeta');
      // Each bucket renders an <h2> group heading.
      expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    },
  );

  it('reports partial failures when some deletes fail and some succeed', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Keep'), item('v90002', 'Drop')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') { calls.push(url); return json({ error: 'no' }, 500); }
      if (url === '/api/wishlist/v90002' && init?.method === 'DELETE') { calls.push(url); return json({ ok: true }); }
      return json({ ok: true });
    });
    const { user } = renderWishlist();
    await screen.findByText('Drop');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Keep' }));
    await user.click(screen.getByRole('button', { name: 'Select Drop' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    // One failed, one removed -> both toasts fire.
    expect(await screen.findByText('Failed on 1 VN(s) - check the console.')).toBeInTheDocument();
    await waitFor(() => expect(calls.length).toBe(2));
  });

  it('shows an error toast when removing a single card fails', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') return json({ error: 'remove boom' }, 500);
      return json({ ok: true });
    });
    const { user } = renderWishlist();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(await screen.findByText('remove boom')).toBeInTheDocument();
    // The card stays because the delete failed.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('navigates back a page via Previous', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&page=2');
    const rows = Array.from({ length: 61 }, (_, index) => item(`v9${String(index + 1).padStart(4, '0')}`, `VN ${index + 1}`));
    installFetch(state(rows));
    const { user } = renderWishlist();
    await screen.findByText('Items 61 to 61 of 61');
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    // page 2 -> previous targets page 1, which deletes the `page` param while
    // keeping the other active params (hideOwned=0).
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0', { scroll: false });
  });

  it('toggles select mode off via the select button', async () => {
    installFetch(state([item('v90001', 'Alpha')]));
    const { user } = renderWishlist();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    // In select mode the card shows a Select button.
    expect(screen.getByRole('button', { name: 'Select Alpha' })).toBeInTheDocument();
    // Exit select mode.
    await user.click(screen.getByRole('button', { name: 'Exit selection' }));
    expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeInTheDocument();
  });

  it('commits a blank search and ignores non-Enter numeric key presses', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&q=alpha');
    installFetch(state([item('v90001', 'Alpha')]));
    renderWishlist();
    await screen.findByText('Alpha');

    nav.replace.mockClear();
    fireEvent.change(screen.getByLabelText('Filter wishlist...'), { target: { value: '   ' } });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0', { scroll: false }));

    nav.replace.mockClear();
    fireEvent.keyDown(screen.getByLabelText('Min rating'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('Max rating'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('Min year'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('Max year'), { key: 'Escape' });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('renders a wishlist API error response', async () => {
    global.fetch = vi.fn(async (): Promise<Response> => json({ error: 'wishlist upstream failed' }, 503));
    renderWishlist();
    expect(await screen.findByRole('alert')).toHaveTextContent('wishlist upstream failed');
  });

  it('drops a successful load that resolves after unmount', async () => {
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const rendered = renderWishlist();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    rendered.unmount();
    pending.resolve(json(state([item('v90001', 'Late')]))); 
    await pending.promise;
    await Promise.resolve();
  });

  it('ignores an aborted load rejection after unmount', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const pending = deferred<Response>();
      init?.signal?.addEventListener('abort', () => pending.reject(abortError), { once: true });
      return pending.promise;
    });
    const rendered = renderWishlist();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    rendered.unmount();
    await Promise.resolve();
  });

  it('leaves refresh state alone when a manual refresh completes after unmount', async () => {
    const refresh = deferred<Response>();
    let requestCount = 0;
    global.fetch = vi.fn(async (): Promise<Response> => {
      requestCount += 1;
      if (requestCount === 1) return json(state([item('v90001', 'Alpha')]));
      return refresh.promise;
    });
    const rendered = renderWishlist();
    const { user } = rendered;
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(requestCount).toBe(2));
    rendered.unmount();
    refresh.resolve(json(state([item('v90002', 'Beta')])));
    await refresh.promise;
    await Promise.resolve();
  });

  it('guards card selection while a bulk delete confirmation is open and supports deselection', async () => {
    installFetch(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
    const { user } = renderWishlist();
    await screen.findByText('Beta');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Select Beta' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('guards rapid refresh, duplicate bulk deletion, and stale empty selection events', async () => {
    installFetch(state([item('v90001', 'Alpha')]));
    renderWishlist();
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Alpha' }));
    const bulkDelete = await screen.findByRole('button', { name: 'Remove from VNDB wishlist' });
    const refresh = screen.getByRole('button', { name: 'Refresh' });

    fireEvent.click(bulkDelete);
    fireEvent.click(refresh);
    fireEvent.click(bulkDelete);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    cleanup();
    installFetch(state([item('v90001', 'Alpha')]));
    renderWishlist();
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Alpha' }));
    const staleBulkDelete = await screen.findByRole('button', { name: 'Remove from VNDB wishlist' });
    fireEvent.click(screen.getByRole('button', { name: 'Select Alpha' }));
    fireEvent.click(staleBulkDelete);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not log AbortError during bulk deletion and reports the failed row', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') throw new DOMException('aborted', 'AbortError');
      return json({ ok: true });
    });
    const { user } = renderWishlist();
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Failed on 1 VN(s) - check the console.')).toBeInTheDocument();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('keeps selection after all bulk deletes fail without showing a success toast', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
      if (url.startsWith('/api/wishlist/') && init?.method === 'DELETE') return json({ error: 'no' }, 500);
      return json({ ok: true });
    });
    const { user } = renderWishlist();
    await screen.findByText('Beta');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Select Beta' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Failed on 2 VN(s) - check the console.')).toBeInTheDocument();
    expect(screen.queryByText('2 VN(s) removed from VNDB wishlist')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('drops bulk delete results that resolve after unmount', async () => {
    const deleteAlpha = deferred<Response>();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') return deleteAlpha.promise;
      return json({ ok: true });
    });
    const rendered = renderWishlist();
    const { user } = rendered;
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/wishlist/v90001', expect.objectContaining({ method: 'DELETE', signal: expect.any(AbortSignal) })));

    rendered.unmount();
    deleteAlpha.resolve(json({ ok: true }));
    await deleteAlpha.promise;
    await Promise.resolve();
  });

  it('guards another single-card delete while one delete is in flight', async () => {
    const deleteAlpha = deferred<Response>();
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') {
        calls.push(url);
        return deleteAlpha.promise;
      }
      if (url === '/api/wishlist/v90002' && init?.method === 'DELETE') {
        calls.push(url);
        return json({ ok: true });
      }
      return json({ ok: true });
    });
    const { user } = renderWishlist();
    await screen.findByText('Beta');

    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Remove Beta' }));
    expect(calls).toEqual(['/api/wishlist/v90001']);

    deleteAlpha.resolve(json({ ok: true }));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('drops single-card success and error results after unmount', async () => {
    for (const status of [200, 500]) {
      cleanup();
      const pendingDelete = deferred<Response>();
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(state([item('v90001', 'Alpha')]));
        if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') return pendingDelete.promise;
        return json({ ok: true });
      });
      const rendered = renderWishlist();
      const { user } = rendered;
      await screen.findByText('Alpha');

      await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));
      rendered.unmount();
      pendingDelete.resolve(status === 200 ? json({ ok: true }) : json({ error: 'late error' }, 500));
      await pendingDelete.promise;
      await Promise.resolve();
    }
  });
});
