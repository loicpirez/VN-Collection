// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapEgsToVndbButton } from '@/components/MapEgsToVndbButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
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

const SEARCH_RESULTS = {
  results: [
    { id: 'v90001', title: 'Result One', released: '2017-01-01', developers: [{ id: 'p90001', name: 'Studio X' }, { id: 'p90002', name: 'Studio Y' }] },
  ],
};

describe('MapEgsToVndbButton branches', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && (!init?.method || init.method === 'GET')) return json({ link: null });
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('compact variant with an existing vndbId shows the edit CTA', () => {
    renderWithProviders(
      <MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90005" variant="compact" />,
      { locale: 'en' },
    );
    const btn = screen.getByRole('button', { name: 'Edit mapping' });
    expect(btn.className).toContain('icon-chip');
  });

  it('opens the dialog from the compact trigger', async () => {
    const { user } = renderWithProviders(
      <MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} variant="compact" />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders the released date and the first two developer chips on a hit', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    expect(within(dialog).getByText('Studio X')).toBeInTheDocument();
    expect(within(dialog).getByText('Studio Y')).toBeInTheDocument();
    expect(within(dialog).getByText('v90001')).toBeInTheDocument();
  });

  it('closes the dialog via the header close button', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the dialog via Escape when no mutation is running', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    await screen.findByRole('dialog');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clears the hit list when the query is emptied (trimmed-empty branch)', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    await user.clear(input);
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });

  it('shows the current-mapping link to the local VN page for a manual link', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: { egs_id: 123, vn_id: 'v90009', note: null, updated_at: 1700000000 } });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90009" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    const link = await within(dialog).findByRole('link', { name: 'v90009' });
    expect(link.getAttribute('href')).toBe('/vn/v90009');
  });

  it('ignores a non-ok hydration response', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ error: 'nope' }, 503);
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90009" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No matches. Refine the search.');
    expect(within(dialog).queryByText(/Current mapping/)).toBeNull();
  });

  it('ignores malformed hydration payloads', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: { egs_id: 'bad' } });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90009" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No matches. Refine the search.');
    expect(within(dialog).queryByText(/Current mapping/)).toBeNull();
  });

  it('does not apply a hydration result after the dialog closes', async () => {
    const hydration = deferred<Response>();
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return hydration.promise;
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90009" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    hydration.resolve(json({ link: { egs_id: 123, vn_id: 'v90009', note: null, updated_at: 1700000000 } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Current mapping/)).toBeNull();
  });

  it('shows search progress, aborts a stale search, and keeps external VNDB clicks non-mutating', async () => {
    const searches: { signal: AbortSignal | null; deferred: ReturnType<typeof deferred<Response>> }[] = [];
    const mutations: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) {
        const request = { signal: init?.signal ?? null, deferred: deferred<Response>() };
        searches.push(request);
        return request.deferred.promise;
      }
      if (String(url).includes('/vndb') && init?.method === 'POST') {
        mutations.push(String(init.body));
        return json({ ok: true });
      }
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(searches).toHaveLength(1));
    expect(dialog.querySelector('.animate-spin')).not.toBeNull();

    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Next Name');
    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[0]!.signal?.aborted).toBe(true);

    searches[0]!.deferred.resolve(json(SEARCH_RESULTS));
    searches[1]!.deferred.resolve(json(SEARCH_RESULTS));
    await within(dialog).findByText('Result One');
    fireEvent.click(within(dialog).getByTitle('Open on VNDB'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mutations).toHaveLength(0);
  });

  it('handles non-ok, malformed, aborted, and thrown search responses', async () => {
    let searchCount = 0;
    const responses: Array<Response | Error> = [
      json({ error: 'upstream' }, 502),
      json({ nope: [] }),
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      new Error('network down'),
    ];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (!String(url).startsWith('/api/search')) return json({ link: null });
      searchCount += 1;
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(searchCount).toBe(1));
    await waitFor(() => expect(dialog.querySelector('.animate-spin')).toBeNull());

    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Malformed');
    await waitFor(() => expect(searchCount).toBe(2));
    await waitFor(() => expect(dialog.querySelector('.animate-spin')).toBeNull());
    await user.clear(input);
    await user.type(input, 'Abort');
    await waitFor(() => expect(searchCount).toBe(3));
    await waitFor(() => expect(dialog.querySelector('.animate-spin')).toBeNull());
    await user.clear(input);
    await user.type(input, 'Network');
    await waitFor(() => expect(searchCount).toBe(4));
    await waitFor(() => expect(dialog.querySelector('.animate-spin')).toBeNull());
  });

  it('does not apply search results after identity changes while decoding the response', async () => {
    let searchStarted = false;
    let view!: ReturnType<typeof renderWithProviders>;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (!String(url).startsWith('/api/search')) return json({ link: null });
      searchStarted = true;
      return {
        ok: true,
        json: async () => {
          await act(async () => {
            view.rerender(<MapEgsToVndbButton egsId={123} gamename="Different Name" vndbId={null} />);
          });
          return SEARCH_RESULTS;
        },
      } as Response;
    });
    view = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    await waitFor(() => expect(searchStarted).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Result One')).toBeNull();
  });

  it('aborts an active search when the component unmounts', async () => {
    const searches: { signal: AbortSignal | null; deferred: ReturnType<typeof deferred<Response>> }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) {
        const request = { signal: init?.signal ?? null, deferred: deferred<Response>() };
        searches.push(request);
        return request.deferred.promise;
      }
      return json({ link: null });
    });
    const { user, unmount } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    await waitFor(() => expect(searches).toHaveLength(1));
    unmount();
    expect(searches[0]!.signal?.aborted).toBe(true);
  });

  it('ignores duplicate pin clicks while a mutation is already running and blocks Escape close while busy', async () => {
    const mutation = deferred<Response>();
    const posts: unknown[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return mutation.promise;
      }
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    const button = within(dialog).getByRole('button', { name: 'Use this' });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(posts).toHaveLength(1));
    await waitFor(() => expect(button).toBeDisabled());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    mutation.resolve(json({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('does not toast or refresh when a successful mutation resolves after identity changes', async () => {
    const mutation = deferred<Response>();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && init?.method === 'POST') return mutation.promise;
      return json({ link: null });
    });
    const view = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    await view.user.click(within(dialog).getByRole('button', { name: 'Use this' }));

    view.rerender(<MapEgsToVndbButton egsId={123} gamename="Different Name" vndbId={null} />);
    mutation.resolve(json({ ok: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Mapping saved')).toBeNull();
  });

  it('does not toast when a failed mutation rejects after identity changes', async () => {
    const mutation = deferred<Response>();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && init?.method === 'POST') return mutation.promise;
      return json({ link: null });
    });
    const view = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    await view.user.click(within(dialog).getByRole('button', { name: 'Use this' }));

    view.rerender(<MapEgsToVndbButton egsId={123} gamename="Different Name" vndbId={null} />);
    mutation.reject(new Error('late failure'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
  });
});
