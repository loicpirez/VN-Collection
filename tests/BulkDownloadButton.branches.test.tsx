// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BulkDownloadButton } from '@/components/BulkDownloadButton';

const refreshSpy = vi.fn();
const navState = { search: '', pathname: '/' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshSpy, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

const OVERRIDE = [
  { id: 'v90001', title: 'Title One' },
  { id: 'v90002', title: 'Title Two' },
];

function assetFetch(perId: Record<string, () => Response> = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
    const match = url.match(/\/api\/collection\/(v\d+)\/assets/);
    if (match && method === 'POST') {
      const id = match[1];
      return Promise.resolve(perId[id] ? perId[id]() : json({ ok: true }));
    }
    return Promise.resolve(json({}));
  });
}

describe('BulkDownloadButton branches', () => {
  beforeEach(() => {
    refreshSpy.mockClear();
    navState.search = '';
    navState.pathname = '/';
    global.fetch = assetFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops the run after a blocked EGS warning and surfaces the warning', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({ ok: true, egs_warning: { kind: 'blocked', status: 403 } }),
      v90002: () => json({ ok: true }),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    // A blocked warning sets stopRequestedRef -> the run aborts after item 1.
    expect(await screen.findByText(/EGS access blocked|EGS blocked|blocked/i)).not.toBeNull();
    const assetCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets'));
    // Only the first VN was processed before the blocked stop.
    expect(assetCalls).toHaveLength(1);
  });

  it('records a non-ok asset response error and a not-ok body error', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({ error: 'explicit error' }, 500),
      v90002: () => json({ ok: false }, 200),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    // Two failures: one from a non-ok response (explicit error), one from ok=false.
    expect(await screen.findByText(/2 failure/)).not.toBeNull();
    fireEvent.click(screen.getByText(/View failures/));
    expect(await screen.findByText(/v90001: explicit error/)).not.toBeNull();
    expect(screen.getByText(/v90002: HTTP 200/)).not.toBeNull();
  });

  it('falls back to the HTTP status when a failed asset response has no error body', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({}, 500),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    fireEvent.click(await screen.findByText(/View failures/));
    expect(await screen.findByText(/v90001: HTTP 500/)).not.toBeNull();
  });

  it('treats a successful non-JSON asset response as a failed item', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') {
        return Promise.resolve(new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }));
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    fireEvent.click(await screen.findByText(/View failures/));
    expect(await screen.findByText(/v90001: HTTP 200/)).not.toBeNull();
  });

  it('records a network error raised by an asset request', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') return Promise.reject(new Error('network down'));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    fireEvent.click(await screen.findByText(/View failures/));
    expect(await screen.findByText(/v90001: network down/)).not.toBeNull();
  });

  it('keeps the latest EGS warning status when a later warning omits the status', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({ ok: true, egs_warning: { kind: 'server', status: 503 } }),
      v90002: () => json({ ok: true, egs_warning: { kind: 'server', status: null } }),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText(/EGS server error/)).not.toBeNull();
    expect(screen.getByText('503')).not.toBeNull();
    expect(screen.getByText(/2 VN/)).not.toBeNull();
  });

  it('renders an EGS warning without a status when none is available', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({ ok: true, egs_warning: { kind: 'server', status: null } }),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText(/EGS server error/)).not.toBeNull();
    expect(screen.queryByText('503')).toBeNull();
  });

  it('ignores a second start while a run is already in flight', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') {
        return new Promise<Response>((resolve, reject) => {
          releaseFirst = resolve;
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    // The trigger is disabled while running -> a second open is impossible; the
    // running progress label is shown instead of the CTA.
    expect(await screen.findByText('Stop')).not.toBeNull();
    const trigger = screen.getByRole('button', { name: /\d+\/\d+/ });
    expect(trigger.hasAttribute('disabled')).toBe(true);
    // Clicking the disabled trigger cannot reopen the menu.
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    // Stop the run so the hung asset fetch is abandoned cleanly.
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    releaseFirst(json({ ok: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
  });

  it('ignores duplicate menu starts before the first run settles', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') {
        return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    const item = screen.getByRole('menuitem', { name: /Download missing/ });
    act(() => {
      fireEvent.click(item);
      fireEvent.click(item);
    });
    await screen.findByRole('button', { name: 'Stop' });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets')).length).toBe(1);
    releaseFirst(json({ ok: true }));
    expect(await screen.findByText('Done')).not.toBeNull();
  });

  it('shows a full-mode running title while a full refresh is active', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') {
        return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Full re-download/ }));
    expect(await screen.findByText(/Downloading \/ Full re-download/)).not.toBeNull();
    releaseFirst(json({ ok: true }));
    expect(await screen.findByText('Done')).not.toBeNull();
  });

  it('does not render the floating result panel outside the library without override items', async () => {
    navState.pathname = '/data';
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: [], pagination: { page: 1, page_size: 500, returned: 0, has_more: false } }));
      }
      return Promise.resolve(json({ ok: true }));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/collection?'))).toBe(true));
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('renders an aborted result when the collection load is aborted', async () => {
    // The full flow first loads the collection; abort that load before items resolve.
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) {
        return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    // No override -> the missing flow loads the collection, which rejects with AbortError.
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    // The AbortError path marks the run aborted+finished.
    expect(await screen.findByText('Stopped')).not.toBeNull();
  });

  it('renders a load error when collection loading fails before assets start', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) return Promise.reject(new Error('collection failed'));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText('collection failed')).not.toBeNull();
  });

  it('does not update after unmount when collection loading resolves late', async () => {
    let resolveCollection: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) {
        return new Promise<Response>((resolve) => { resolveCollection = resolve; });
      }
      return Promise.resolve(json({ ok: true }));
    });
    global.fetch = fetchMock;
    const view = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: /Download all/ }));
    await view.user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    view.unmount();
    resolveCollection(json({ items: OVERRIDE, pagination: { page: 1, page_size: 500, returned: 2, has_more: false } }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/collection?'))).toBe(true));
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('does not update after unmount when collection loading rejects late', async () => {
    let rejectCollection: (reason: Error) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) {
        return new Promise<Response>((_resolve, reject) => { rejectCollection = reject; });
      }
      return Promise.resolve(json({ ok: true }));
    });
    global.fetch = fetchMock;
    const view = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: /Download all/ }));
    await view.user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    view.unmount();
    rejectCollection(new Error('late collection failed'));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/collection?'))).toBe(true));
    expect(screen.queryByText('late collection failed')).toBeNull();
  });

  it('does not update after unmount when an asset request resolves late', async () => {
    let resolveAsset: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/assets') && method === 'POST') {
        return new Promise<Response>((resolve) => { resolveAsset = resolve; });
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const view = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: /Download all/ }));
    await view.user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    view.unmount();
    resolveAsset(json({ ok: true }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/assets'))).toBe(true));
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('does not finish when an item-done callback unmounts the component after the last item', async () => {
    const fetchMock = assetFetch();
    global.fetch = fetchMock;
    let view: ReturnType<typeof renderWithProviders> | null = null;
    const onItemDone = vi.fn(() => view?.unmount());
    view = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} onItemDone={onItemDone} />, { locale: 'en' });
    await view.user.click(screen.getByRole('button', { name: /Download all/ }));
    await view.user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    await waitFor(() => expect(onItemDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('shows an error when the final router refresh throws after a completed run', async () => {
    refreshSpy.mockImplementationOnce(() => {
      throw new Error('refresh exploded');
    });
    const fetchMock = assetFetch();
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText('refresh exploded')).not.toBeNull();
  });

  it('ignores a failed global refresh kickoff while item asset downloads continue', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.reject(new Error('global failed'));
      if (url.includes('/assets') && method === 'POST') return Promise.resolve(json({ ok: true }));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE.slice(0, 1)} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText('Done')).not.toBeNull();
    expect(screen.queryByText('global failed')).toBeNull();
  });

  it('retries failed VNs by reloading collection rows when no override is supplied', async () => {
    const collectionItems = OVERRIDE.map((row) => ({
      id: row.id,
      title: row.title,
      alttitle: null,
      released: null,
      status: null,
      rating: null,
      user_rating: null,
      playtime_minutes: null,
      added_at: null,
      updated_at: null,
    }));
    let phase = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: collectionItems, pagination: { page: 1, page_size: 500, returned: 2, has_more: false } }));
      }
      const match = url.match(/\/api\/collection\/(v\d+)\/assets/);
      if (match && method === 'POST') {
        if (match[1] === 'v90002' && phase === 0) return Promise.resolve(json({ error: 'first boom' }, 500));
        return Promise.resolve(json({ ok: true }));
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    const retry = await screen.findByRole('button', { name: /Retry 1 failed/ });
    phase = 1;
    fetchMock.mockClear();
    await user.click(retry);
    await waitFor(() => {
      const assetCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets'));
      expect(assetCalls).toHaveLength(1);
      expect(String(assetCalls[0][0])).toContain('v90002');
    });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/collection?'))).toBe(true);
  });

  it('ignores a duplicate retry click while the retry run is pending', async () => {
    let phase = 0;
    let resolveRetry: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      const match = url.match(/\/api\/collection\/(v\d+)\/assets/);
      if (match && method === 'POST') {
        if (match[1] === 'v90002' && phase === 0) return Promise.resolve(json({ error: 'first boom' }, 500));
        if (phase === 0) return Promise.resolve(json({ ok: true }));
        return new Promise<Response>((resolve) => { resolveRetry = resolve; });
      }
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    const retry = await screen.findByRole('button', { name: /Retry 1 failed/ });
    phase = 1;
    fetchMock.mockClear();
    act(() => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    await screen.findByRole('button', { name: 'Stop' });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets')).length).toBe(1);
    resolveRetry(json({ ok: true }));
    expect(await screen.findByText(/all up to date/)).not.toBeNull();
  });
});
