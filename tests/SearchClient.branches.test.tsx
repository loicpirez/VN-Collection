// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SearchClient } from '@/components/SearchClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { EgsCandidate } from '@/lib/erogamescape';
import type { VndbSearchHit } from '@/lib/types';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => nav.searchParams,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options?: { loading?: () => ReactNode }) => {
    void loader();
    options?.loading?.();
    return function DynamicTextualSearchPanel({ query }: { query: string }) {
    return <div data-testid="textual-search-panel">{query}</div>;
    };
  },
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: { id: string; title: string; poster?: string | null } }) => (
    <article data-poster={data.poster ?? ''} data-testid="search-card"><h2>{data.title}</h2><span>{data.id}</span></article>
  ),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function hit(overrides: Partial<VndbSearchHit> = {}): VndbSearchHit {
  return {
    id: 'v90001',
    title: 'Search Result One',
    alttitle: null,
    aliases: [],
    titles: [{ lang: 'en', title: 'Search Result One', latin: null, official: true, main: true }],
    released: '2020-01-02',
    rating: 82,
    votecount: 123,
    length_minutes: 600,
    languages: ['en', 'ja'],
    platforms: ['win'],
    image: { url: 'https://img.example.invalid/full.jpg', thumbnail: 'https://img.example.invalid/thumb.jpg' },
    developers: [{ name: 'Studio One' }],
    in_collection: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<EgsCandidate> = {}): EgsCandidate {
  return { id: 90001, gamename: 'EGS Result One', gamename_furigana: null, median: 80, count: 45, sellday: '2020-01-02', ...overrides };
}

function renderSearchClient() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <SearchClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

function installFetch(handler?: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (handler) return handler(url, init);
    if (url.startsWith('/api/search/advanced')) return json({ results: [hit({ id: 'v90002', title: 'Advanced Result' })] });
    if (url.startsWith('/api/search')) return json({ results: [hit()] });
    if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
    return json({});
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useRealTimers();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.refresh.mockClear();
  nav.searchParams = new URLSearchParams();
  localStorage.clear();
  installFetch();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe('SearchClient branches', () => {
  it('ignores a non-numeric length param from the URL', async () => {
    // readAdvFromUrl num() returns null for a non-finite value -> the lengthMin/Max
    // fall back to null and advanced is still considered active via langs.
    nav.searchParams = new URLSearchParams('langs=en&lengthMin=abc&lengthMax=');
    renderSearchClient();
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
  });

  it('accepts numeric length params from the URL', async () => {
    nav.searchParams = new URLSearchParams('langs=en&lengthMin=2&lengthMax=3');
    renderSearchClient();
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/advanced',
      expect.objectContaining({
        body: expect.stringContaining('"lengthMin":2'),
      }),
    );
  });

  it('uses full-size VNDB images and null posters when thumbnails are unavailable', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/search')) {
        return json({
          results: [
            hit({ id: 'v90010', title: 'Full Image', image: { url: 'https://img.example.invalid/full-only.jpg', thumbnail: '' } }),
            hit({ id: 'v90011', title: 'No Image', image: null }),
          ],
        });
      }
      return json({});
    });
    const { user } = renderSearchClient();
    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'images');
    await screen.findByText('Full Image');
    const cards = screen.getAllByTestId('search-card');
    expect(cards[0]).toHaveAttribute('data-poster', 'https://img.example.invalid/full-only.jpg');
    expect(cards[1]).toHaveAttribute('data-poster', '');
  });

  it('deselects a language chip on a second click', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    const english = screen.getByRole('button', { name: 'English' });
    await user.click(english);
    expect(english.getAttribute('aria-pressed')).toBe('true');
    // Second click removes it (the toggle "includes" else branch).
    await user.click(english);
    expect(english.getAttribute('aria-pressed')).toBe('false');
  });

  it('selects then clears the length range via the inline cancel chip', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await user.click(screen.getByRole('button', { name: /3 \/ / }));
    // The clear chip only renders once a length bound is set.
    const cancelChip = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelChip);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull());
  });

  it('navigates source tabs left with the keyboard, wrapping to Local', async () => {
    const { user } = renderSearchClient();
    const tablist = screen.getByRole('tablist', { name: 'Search sources' });
    await user.click(screen.getByRole('tab', { name: 'VNDB' }));
    // ArrowLeft from vndb wraps to the last tab (local).
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    // A non-arrow key is a no-op.
    fireEvent.keyDown(tablist, { key: 'Enter' });
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicks the Local tab directly and renders the standalone textual panel', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'Local' }));
    await user.type(screen.getByRole('searchbox', { name: /local collection/ }), 'memo text');
    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('memo text');
  });

  it('shows the EGS hero state before any query is typed on the EGS tab', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    // touched is false and no egs results -> the EGS hero renders.
    expect(screen.getByText(/.+/, { selector: 'h2' })).toBeInTheDocument();
  });

  it('clears VNDB results when the query is emptied', async () => {
    vi.useFakeTimers();
    renderSearchClient();
    const input = screen.getByRole('searchbox', { name: /VNDB/ });
    fireEvent.change(input, { target: { value: 'result' } });
    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Search Result One')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
      await Promise.resolve();
    });
    // Empty query short-circuits the effect -> results reset to empty.
    expect(screen.queryByText('Search Result One')).not.toBeInTheDocument();
  });

  it('clears EGS results when the query is emptied on the EGS tab', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    const input = screen.getByRole('searchbox', { name: /ErogameScape/ });
    await user.type(input, 'egs');
    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    await user.clear(input);
    await waitFor(() => expect(screen.queryByText('EGS Result One')).not.toBeInTheDocument());
  });

  it('marks an already-added EGS row as in collection after a successful add', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'egs');
    await screen.findByText('EGS Result One');
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) return json({ vn_id: 'egs_90001' });
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    await user.click(screen.getByRole('button', { name: /Add via EGS/ }));
    // After the add resolves the button flips to the in-collection label.
    expect(await screen.findByText('In collection')).toBeInTheDocument();
  });

  it('reacts to an external URL switch into the EGS source', async () => {
    const { rerender } = renderSearchClient();
    expect(screen.getByRole('tab', { name: 'VNDB' })).toHaveAttribute('aria-selected', 'true');
    nav.searchParams = new URLSearchParams('source=egs&q=switch');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );
    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'EGS' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reacts to an external URL switch into the Local source', async () => {
    const { rerender } = renderSearchClient();
    nav.searchParams = new URLSearchParams('source=local&q=memo');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('memo');
  });

  it('disables the reverse toggle until a sort field is chosen', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    // sort === '' by default -> the reverse chip is disabled.
    expect((screen.getByRole('button', { name: 'Reverse order' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a sort field and persists the reverse flag to the URL', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'released' } });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?sort=released&reverse=1', { scroll: false }));
    // Toggling reverse off drops it from the URL.
    await user.click(screen.getByRole('button', { name: 'Reverse order' }));
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?sort=released', { scroll: false }));
  });

  it('resets the sort select back to default and clears the reverse flag', async () => {
    nav.searchParams = new URLSearchParams('sort=rating&reverse=1');
    renderSearchClient();
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: '' } });
    // sort === '' -> reverse forced false; the URL drops both params.
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search', { scroll: false }));
  });

  it('drops owned URL changes without resetting local search state', async () => {
    const { user, rerender } = renderSearchClient();
    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'owned');
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?q=owned', { scroll: false }));

    nav.searchParams = new URLSearchParams('q=owned');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );

    expect(screen.getByRole('searchbox', { name: /VNDB/ })).toHaveValue('owned');
  });

  it('evicts older owned URL keys after many local writes', async () => {
    vi.useFakeTimers();
    try {
      renderSearchClient();
      for (let i = 0; i < 21; i += 1) {
        fireEvent.change(screen.getByRole('searchbox', { name: /VNDB/ }), { target: { value: `query-${i}` } });
        await act(async () => {
          vi.advanceTimersByTime(301);
        });
        expect(nav.replace).toHaveBeenLastCalledWith(`/search?q=query-${i}`, { scroll: false });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs advanced search after an external advanced URL change', async () => {
    const { rerender } = renderSearchClient();
    nav.searchParams = new URLSearchParams('langs=en&platforms=win&yearMin=2001&yearMax=2005&ratingMin=70');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );

    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/advanced',
      expect.objectContaining({
        body: expect.stringContaining('"platforms":["win"]'),
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/advanced',
      expect.objectContaining({
        body: expect.stringContaining('"yearMin":2001'),
      }),
    );
  });

  it('does not surface AbortError from VNDB or EGS quick search', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    installFetch(async (url) => {
      if (url.startsWith('/api/search') || url.startsWith('/api/egs/search')) throw abortError;
      return json({});
    });
    const { user } = renderSearchClient();
    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'abort');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/search?q=abort'), expect.anything()));
    expect(screen.queryByText('Search error')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'abort');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/egs/search?q=abort'), expect.anything()));
    expect(screen.queryByText('Search error')).toBeNull();
  });

  it('ignores aborted in-flight quick search completions', async () => {
    vi.useFakeTimers();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const vndbPending = deferredResponse();
    const egsPending = deferredResponse();
    try {
      installFetch((url) => {
        if (url.startsWith('/api/search?q=first')) return vndbPending.promise;
        if (url.startsWith('/api/search?q=second')) return json({ results: [hit({ title: 'Second VNDB' })] });
        if (url.startsWith('/api/egs/search?q=first')) return egsPending.promise;
        if (url.startsWith('/api/egs/search?q=second')) return json({ candidates: [candidate({ gamename: 'Second EGS' })] });
        return json({});
      });
      const first = renderSearchClient();
      fireEvent.change(screen.getByRole('searchbox', { name: /VNDB/ }), { target: { value: 'first' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(351);
      });
      fireEvent.change(screen.getByRole('searchbox', { name: /VNDB/ }), { target: { value: 'second' } });
      await act(async () => {
        vndbPending.reject(abortError);
        await vndbPending.promise.catch(() => undefined);
        await vi.advanceTimersByTimeAsync(351);
      });
      expect(screen.getByText('Second VNDB')).toBeInTheDocument();
      first.unmount();

      const second = renderSearchClient();
      fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
      fireEvent.change(screen.getByRole('searchbox', { name: /ErogameScape/ }), { target: { value: 'first' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(351);
      });
      fireEvent.change(screen.getByRole('searchbox', { name: /ErogameScape/ }), { target: { value: 'second' } });
      await act(async () => {
        egsPending.reject(abortError);
        await egsPending.promise.catch(() => undefined);
        await vi.advanceTimersByTimeAsync(351);
      });
      expect(screen.getByText('Second EGS')).toBeInTheDocument();
      second.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses localized fallback messages for non-Error search failures', async () => {
    installFetch(async (url) => {
      if (url.startsWith('/api/search')) throw 'plain failure';
      return json({});
    });
    const first = renderSearchClient();
    await first.user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'plain');
    expect(await screen.findByText('Search error')).toBeInTheDocument();
    first.unmount();

    installFetch(async (url) => {
      if (url.startsWith('/api/egs/search')) throw 'plain egs failure';
      return json({});
    });
    const second = renderSearchClient();
    await second.user.click(screen.getByRole('tab', { name: 'EGS' }));
    await second.user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'plain');
    expect(await screen.findByText('Search error')).toBeInTheDocument();
  });

  it('ignores duplicate EGS add clicks while the first add is pending', async () => {
    const pending = deferredResponse();
    let addCalls = 0;
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) {
        addCalls += 1;
        return pending.promise;
      }
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'egs');
    await screen.findByText('EGS Result One');
    const add = screen.getByRole('button', { name: /Add via EGS/ });
    act(() => {
      add.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      add.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(addCalls).toBe(1));
    await act(async () => {
      pending.resolve(json({ vn_id: 'egs_90001' }));
      await pending.promise;
    });
  });

  async function runEgsQuickSearch(): Promise<void> {
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    fireEvent.change(screen.getByRole('searchbox', { name: /ErogameScape/ }), { target: { value: 'egs' } });
    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('EGS Result One')).toBeInTheDocument();
  }

  it('surfaces malformed EGS add responses', async () => {
    vi.useFakeTimers();
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) return json({ broken: true });
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    renderSearchClient();
    await runEgsQuickSearch();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add via EGS/ }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('drops stale EGS add success after unmount', async () => {
    vi.useFakeTimers();
    const success = deferredResponse();
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) return success.promise;
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    const second = renderSearchClient();
    await runEgsQuickSearch();
    fireEvent.click(screen.getByRole('button', { name: /Add via EGS/ }));
    second.unmount();
    await act(async () => {
      success.resolve(json({ vn_id: 'egs_90001' }));
      await success.promise;
    });
    expect(nav.push).not.toHaveBeenCalledWith('/vn/egs_90001');
  });

  it('drops stale EGS add failure after unmount', async () => {
    vi.useFakeTimers();
    const failure = deferredResponse();
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) return failure.promise;
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    const third = renderSearchClient();
    await runEgsQuickSearch();
    fireEvent.click(screen.getByRole('button', { name: /Add via EGS/ }));
    third.unmount();
    await act(async () => {
      failure.reject(new Error('late add failure'));
      await failure.promise.catch(() => undefined);
    });
    expect(screen.queryByText('late add failure')).toBeNull();
  });

  it('handles malformed and stale advanced search responses', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/search/advanced')) return json({ broken: true });
      return json({ results: [hit()] });
    });
    const first = renderSearchClient();
    await first.user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await first.user.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    expect(await screen.findByText('Search error')).toBeInTheDocument();
    first.unmount();

    const pending = deferredResponse();
    installFetch((url) => {
      if (url.startsWith('/api/search/advanced')) return pending.promise;
      return json({ results: [hit()] });
    });
    const second = renderSearchClient();
    await second.user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await second.user.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    second.unmount();
    await act(async () => {
      pending.resolve(json({ results: [hit({ title: 'Stale Advanced' })] }));
      await pending.promise;
    });
    expect(screen.queryByText('Stale Advanced')).toBeNull();
  });

  it('drops stale advanced failures and falls back for plain advanced failures', async () => {
    const stale = deferredResponse();
    installFetch((url) => {
      if (url.startsWith('/api/search/advanced')) return stale.promise;
      return json({ results: [hit()] });
    });
    const first = renderSearchClient();
    await first.user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await first.user.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    first.unmount();
    await act(async () => {
      stale.reject(new Error('late advanced failure'));
      await stale.promise.catch(() => undefined);
    });
    expect(screen.queryByText('late advanced failure')).toBeNull();

    installFetch(async (url) => {
      if (url.startsWith('/api/search/advanced')) throw 'plain advanced failure';
      return json({ results: [hit()] });
    });
    const second = renderSearchClient();
    await second.user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await second.user.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    expect(await screen.findByText('Search error')).toBeInTheDocument();
  });

  it('lets the latest advanced search own completion state', async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    let calls = 0;
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    installFetch((url) => {
      if (url.startsWith('/api/search/advanced')) {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      }
      return json({ results: [hit()] });
    });
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => {
      first.reject(abortError);
      await first.promise.catch(() => undefined);
    });
    await act(async () => {
      second.resolve(json({ results: [hit({ title: 'Latest Advanced' })] }));
      await second.promise;
    });
    expect(await screen.findByText('Latest Advanced')).toBeInTheDocument();
  });
});
