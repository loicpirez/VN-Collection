// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { TextualSearchPanel } from '@/components/TextualSearchPanel';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

const t = dictionaries.en;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function libraryPayload() {
  return {
    matches: [
      {
        id: 'v90010',
        title: 'Lib Title',
        alttitle: 'Lib Alt',
        image_url: 'https://cdn.test/c.jpg',
        image_thumb: 'https://cdn.test/t.jpg',
        local_image: null,
        local_image_thumb: null,
        image_sexual: 0,
      },
      {
        id: 'v90011',
        title: 'Same Title',
        alttitle: 'Same Title',
        image_url: null,
        image_thumb: null,
        local_image: null,
        local_image_thumb: null,
        image_sexual: null,
      },
    ],
  };
}

function textualPayload() {
  return {
    hits: [
      { vn_id: 'v90020', title: 'Notes Hit', source: 'notes', snippet: 'a note snippet' },
      { vn_id: 'v90021', title: 'Synopsis Hit', source: 'custom_description', snippet: 'a synopsis snippet' },
      { vn_id: 'v90022', title: 'Quote Hit', source: 'quote', snippet: 'a quote snippet' },
    ],
  };
}

function strongLibraryPayload() {
  return {
    matches: Array.from({ length: 6 }, (_value, index) => ({
      id: `v${90100 + index}`,
      title: `Canvas ${index + 1}`,
      alttitle: null,
      image_url: null,
      image_thumb: null,
      local_image: null,
      local_image_thumb: null,
      image_sexual: null,
    })),
  };
}

function routedFetch(opts: { library?: unknown; textual?: unknown; failLibrary?: boolean; failTextual?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith('/api/collection/find')) {
      if (opts.failLibrary) return new Response('err', { status: 500 });
      return json(opts.library ?? { matches: [] });
    }
    if (u.startsWith('/api/search/textual')) {
      if (opts.failTextual) return new Response('err', { status: 500 });
      return json(opts.textual ?? { hits: [] });
    }
    return json({});
  });
}

beforeEach(() => {
  global.fetch = routedFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TextualSearchPanel branches', () => {
  it('renders nothing in accordion mode for a short query', () => {
    const { container } = renderWithProviders(<TextualSearchPanel query="a" />, { locale: 'en' });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing in accordion mode when the query yields no hits', async () => {
    global.fetch = routedFetch({ library: { matches: [] }, textual: { hits: [] } });
    const { container } = renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('shows the collapsed accordion header with the hit count and toggles open', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    // 2 library + 3 textual = 5 hits in the count badge.
    const toggle = await screen.findByRole('button', { name: new RegExp(t.textualSearch.title) });
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent((t.textualSearch.statusCount as string).replace('{n}', '5'));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Library + textual sections both render once expanded.
    expect(screen.getByText(t.textualSearch.libraryTitle)).toBeInTheDocument();
    expect(screen.getByText('Lib Title')).toBeInTheDocument();
    expect(screen.getByText('Notes Hit')).toBeInTheDocument();
    // Library alt-title that differs renders; the matching one does not duplicate.
    expect(screen.getByText('Lib Alt')).toBeInTheDocument();
    // All three textual source labels render.
    expect(screen.getByText(t.textualSearch.source.notes)).toBeInTheDocument();
    expect(screen.getByText(t.textualSearch.source.custom_description)).toBeInTheDocument();
    expect(screen.getByText(t.textualSearch.source.quote)).toBeInTheDocument();
  });

  it('skips secondary textual search for enough strong accordion title matches', async () => {
    const fetchMock = routedFetch({ library: strongLibraryPayload(), textual: textualPayload() });
    global.fetch = fetchMock;
    renderWithProviders(<TextualSearchPanel query="canvas" />, { locale: 'en' });

    const toggle = await screen.findByRole('button', { name: new RegExp(t.textualSearch.title) });
    await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument());
    fireEvent.click(toggle);
    expect(screen.getByText('Canvas 1')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/search/textual'))).toBe(false);
  });

  it('always searches textual fields in explicit standalone local mode', async () => {
    const fetchMock = routedFetch({ library: strongLibraryPayload(), textual: textualPayload() });
    global.fetch = fetchMock;
    renderWithProviders(<TextualSearchPanel query="canvas" mode="standalone" />, { locale: 'en' });

    expect(await screen.findByText('Notes Hit')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/search/textual'))).toBe(true);
  });

  it('renders the standalone hero state for a short query', () => {
    renderWithProviders(<TextualSearchPanel query="a" mode="standalone" />, { locale: 'en' });
    expect(screen.getByText(t.search.localHeroTitle)).toBeInTheDocument();
    expect(screen.getByText(t.search.localHeroSubtitle)).toBeInTheDocument();
  });

  it('renders the standalone empty state when nothing matches', async () => {
    global.fetch = routedFetch({ library: { matches: [] }, textual: { hits: [] } });
    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByText(t.textualSearch.empty)).toBeInTheDocument();
  });

  it('renders standalone expanded with results and no toggle button', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByText('Lib Title')).toBeInTheDocument();
    // Standalone mode is always expanded -> no accordion toggle.
    expect(screen.queryByRole('button', { name: new RegExp(t.textualSearch.title) })).toBeNull();
  });

  it('shows the loading skeleton before the debounced fetch resolves (standalone)', () => {
    global.fetch = routedFetch({ library: libraryPayload(), textual: textualPayload() });
    const { container } = renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    // The 280ms debounce has not elapsed yet -> the busy skeleton list is present.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(t.textualSearch.statusLoading as string);
  });

  it('keeps the standalone shell rendered when only the library returns hits', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), textual: { hits: [] } });
    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByText('Lib Title')).toBeInTheDocument();
    expect(screen.getByText(t.textualSearch.libraryTitle)).toBeInTheDocument();
  });

  it('keeps the standalone shell rendered when only textual hits return', async () => {
    global.fetch = routedFetch({ library: { matches: [] }, textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByText('Notes Hit')).toBeInTheDocument();
    // No library section header when there are zero library hits.
    expect(screen.queryByText(t.textualSearch.libraryTitle)).toBeNull();
  });

  it('shows a retryable error in accordion mode when the library fetch fails', async () => {
    global.fetch = routedFetch({ failLibrary: true, textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    await waitFor(() => expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    expect(screen.getByRole('status')).toHaveTextContent(t.textualSearch.statusError as string);
    expect(screen.getByRole('button', { name: t.common.retry })).toBeInTheDocument();
  });

  it('shows a retryable error in accordion mode when the textual fetch fails', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), failTextual: true });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    await waitFor(() => expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('shows a retryable error in standalone mode when local search fails', async () => {
    global.fetch = routedFetch({ failLibrary: true, textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    expect(screen.getByRole('button', { name: t.common.retry })).toBeInTheDocument();
  });

  it('treats a malformed library payload as a thrown error', async () => {
    // decodeCollectionFindMatches returns null for a non-array matches -> the
    // `if (!matches) throw` branch fires and the batch rejects.
    global.fetch = routedFetch({ library: { matches: 'not-an-array' }, textual: textualPayload() });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    await waitFor(() => expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('treats a malformed textual payload as a thrown error', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), textual: { hits: 'not-an-array' } });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    await waitFor(() => expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('retries a failed local search from the visible error state', async () => {
    let libraryCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) {
        libraryCalls += 1;
        if (libraryCalls === 1) return new Response('err', { status: 500 });
        return json(libraryPayload());
      }
      if (u.startsWith('/api/search/textual')) return json({ hits: [] });
      return json({});
    });
    renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.common.retry }));
    expect(await screen.findByText('Lib Title')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears stale local results when the next search fails', async () => {
    let shouldFail = false;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) {
        if (shouldFail) return new Response('err', { status: 500 });
        return json(libraryPayload());
      }
      if (u.startsWith('/api/search/textual')) return json(textualPayload());
      return json({});
    });
    const { rerender } = renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    expect(await screen.findByText('Lib Title')).toBeInTheDocument();
    expect(screen.getByText('Notes Hit')).toBeInTheDocument();

    shouldFail = true;
    rerender(<TextualSearchPanel query="other" mode="standalone" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    expect(screen.queryByText('Lib Title')).toBeNull();
    expect(screen.queryByText('Notes Hit')).toBeNull();
  });

  it('uses the localized fallback when local search rejects with a non-Error value', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) return Promise.reject('bad search');
      if (u.startsWith('/api/search/textual')) return Promise.resolve(json(textualPayload()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;

    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });

    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('drops stale results after the query changes while requests are pending', async () => {
    vi.useFakeTimers();
    let resolveLibrary: (response: Response) => void = () => {};
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) {
        return new Promise<Response>((resolve) => { resolveLibrary = resolve; });
      }
      if (u.startsWith('/api/search/textual')) return Promise.resolve(json(textualPayload()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;

    const { container, rerender } = renderWithProviders(<TextualSearchPanel query="memo" />, { locale: 'en' });
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender(<TextualSearchPanel query="other" />);
    await act(async () => {
      resolveLibrary(json(libraryPayload()));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Lib Title');
    expect(container.textContent).not.toContain('Notes Hit');
  });

  it('drops a textual response that resolves after its query was replaced', async () => {
    vi.useFakeTimers();
    let resolveTextual: (response: Response) => void = () => {};
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) return Promise.resolve(json(libraryPayload()));
      if (u.startsWith('/api/search/textual')) {
        return new Promise<Response>((resolve) => { resolveTextual = resolve; });
      }
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;

    const { container, rerender } = renderWithProviders(
      <TextualSearchPanel query="memo" mode="standalone" />,
      { locale: 'en' },
    );
    await act(async () => {
      vi.advanceTimersByTime(280);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    rerender(<TextualSearchPanel query="other" mode="standalone" />);
    await act(async () => {
      resolveTextual(json(textualPayload()));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Notes Hit');
  });

  it('suppresses AbortError search failures without logging', async () => {
    vi.useFakeTimers();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) return Promise.reject(abortError);
      if (u.startsWith('/api/search/textual')) return Promise.resolve(json({ hits: [] }));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;

    renderWithProviders(<TextualSearchPanel query="memo" mode="standalone" />, { locale: 'en' });
    await act(async () => {
      vi.advanceTimersByTime(280);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(console.error).not.toHaveBeenCalled();
  });
});
