// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapVnToEgsButton } from '@/components/MapVnToEgsButton';

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

const RICH_CANDIDATES = {
  candidates: [
    { id: 11111, gamename: 'Candidate One', gamename_furigana: null, median: 80, count: 42, sellday: '2017-01-01' },
  ],
};

/** Hydration shape accepted by decodeVnEgsMappingState. */
function mappingState(source: string | null, egsId: number | null) {
  return {
    game: egsId != null && source !== 'manual-none' ? { id: egsId } : null,
    manual: source === 'manual' ? { egs_id: egsId } : source === 'manual-none' ? { egs_id: null } : null,
    source,
  };
}

describe('MapVnToEgsButton branches', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json(RICH_CANDIDATES);
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the dialog from the compact trigger', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" variant="compact" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders an automatic (non-manual) current mapping with no reset button', async () => {
    // `extlink` is a non-manual provenance label; the dialog renders it as
    // "(automatic)" and omits the reset affordance.
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('extlink', 44444));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('EGS #44444')).toBeInTheDocument();
    // "(automatic)" source label is shown next to the link.
    expect(within(dialog).getByText('(automatic)')).toBeInTheDocument();
    // No "Back to automatic" reset for an auto-sourced link.
    expect(within(dialog).queryByRole('button', { name: 'Back to automatic' })).toBeNull();
  });

  it('renders candidate metadata (sellday, score, votes)', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    // EGS id badge.
    expect(within(dialog).getByText('EGS #11111')).toBeInTheDocument();
    // Median score "80/100".
    expect(within(dialog).getByText('80/100')).toBeInTheDocument();
    // Vote count chip includes the localized "votes" label.
    expect(within(dialog).getByText(/42/)).toBeInTheDocument();
  });

  it('closes via the header close button', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes via Escape and backdrop click when no mutation is running', async () => {
    const first = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await first.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    await screen.findByRole('dialog');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount();

    const second = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await second.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ignores non-ok, malformed, rejected, and stale hydration results', async () => {
    const hydration = deferred<Response>();
    const responses: Array<Response | Promise<Response> | Error> = [
      json({ error: 'nope' }, 503),
      json({ game: { id: 'bad' }, manual: null, source: null }),
      new Error('hydrate failed'),
      hydration.promise,
    ];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });

    const first = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await first.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    let dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No matches. Refine the search.');
    expect(within(dialog).queryByText(/Current mapping/)).toBeNull();
    first.unmount();

    const second = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await second.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No matches. Refine the search.');
    expect(within(dialog).queryByText(/Current mapping/)).toBeNull();
    second.unmount();

    const third = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await third.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('No matches. Refine the search.');
    expect(within(dialog).queryByText(/Current mapping/)).toBeNull();
    third.unmount();

    const fourth = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await fourth.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    dialog = await screen.findByRole('dialog');
    await fourth.user.click(within(dialog).getByRole('button', { name: 'Close' }));
    hydration.resolve(json(mappingState('manual', 44444)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Current mapping/)).toBeNull();
  });

  it('resets a manual-none pin via DELETE mode=clear-manual', async () => {
    let resetUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('mode=clear-manual') && init?.method === 'DELETE') {
        resetUrl = String(url);
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('manual-none', null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No EGS counterpart (confirmed)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back to automatic' }));
    await waitFor(() => expect(resetUrl).toBe('/api/vn/v90001/erogamescape?mode=clear-manual'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('clears candidates when the search box is emptied (trimmed-empty path)', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    const input = within(dialog).getByLabelText('Search EGS...') as HTMLInputElement;
    await user.clear(input);
    // Empty query -> setCandidates([]) -> the empty hint shows.
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });

  it('shows search progress, aborts stale search, and keeps external EGS clicks non-mutating', async () => {
    const searches: { signal: AbortSignal | null; deferred: ReturnType<typeof deferred<Response>> }[] = [];
    const mutations: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) {
        const request = { signal: init?.signal ?? null, deferred: deferred<Response>() };
        searches.push(request);
        return request.deferred.promise;
      }
      if (String(url).includes('/erogamescape') && init?.method === 'POST') {
        mutations.push(String(init.body));
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(searches).toHaveLength(1));
    expect(dialog.querySelector('.animate-spin')).not.toBeNull();

    const input = within(dialog).getByLabelText('Search EGS...') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Next Name');
    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[0]!.signal?.aborted).toBe(true);

    searches[0]!.deferred.resolve(json(RICH_CANDIDATES));
    searches[1]!.deferred.resolve(json(RICH_CANDIDATES));
    await within(dialog).findByText('Candidate One');
    fireEvent.click(within(dialog).getByTitle('Open on EGS'));
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
      if (!String(url).startsWith('/api/egs/search')) return json(mappingState(null, null));
      searchCount += 1;
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(searchCount).toBe(1));
    await waitFor(() => expect(dialog.querySelector('.animate-spin')).toBeNull());

    const input = within(dialog).getByLabelText('Search EGS...') as HTMLInputElement;
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
      if (!String(url).startsWith('/api/egs/search')) return json(mappingState(null, null));
      searchStarted = true;
      return {
        ok: true,
        json: async () => {
          await act(async () => {
            view.rerender(<MapVnToEgsButton vnId="v90001" seedQuery="Different Name" />);
          });
          return RICH_CANDIDATES;
        },
      } as Response;
    });
    view = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    await waitFor(() => expect(searchStarted).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Candidate One')).toBeNull();
  });

  it('aborts an active search when the component unmounts', async () => {
    const searches: { signal: AbortSignal | null; deferred: ReturnType<typeof deferred<Response>> }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) {
        const request = { signal: init?.signal ?? null, deferred: deferred<Response>() };
        searches.push(request);
        return request.deferred.promise;
      }
      return json(mappingState(null, null));
    });
    const { user, unmount } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    await waitFor(() => expect(searches).toHaveLength(1));
    unmount();
    expect(searches[0]!.signal?.aborted).toBe(true);
  });

  it('ignores duplicate pin clicks while busy and blocks Escape and backdrop close', async () => {
    const mutation = deferred<Response>();
    const posts: unknown[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(RICH_CANDIDATES);
      if (String(url).includes('/erogamescape') && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return mutation.promise;
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
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
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    mutation.resolve(json({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('does not toast or refresh when a successful mutation resolves after identity changes', async () => {
    const mutation = deferred<Response>();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(RICH_CANDIDATES);
      if (String(url).includes('/erogamescape') && init?.method === 'POST') return mutation.promise;
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const view = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    await view.user.click(within(dialog).getByRole('button', { name: 'Use this' }));

    view.rerender(<MapVnToEgsButton vnId="v90001" seedQuery="Different Name" />);
    mutation.resolve(json({ ok: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Mapping saved')).toBeNull();
  });

  it('does not toast when a failed mutation rejects after identity changes', async () => {
    const mutation = deferred<Response>();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(RICH_CANDIDATES);
      if (String(url).includes('/erogamescape') && init?.method === 'POST') return mutation.promise;
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const view = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    await view.user.click(within(dialog).getByRole('button', { name: 'Use this' }));

    view.rerender(<MapVnToEgsButton vnId="v90001" seedQuery="Different Name" />);
    mutation.reject(new Error('late failure'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
  });
});
