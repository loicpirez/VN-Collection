// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
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

/** Per-asset response keyed by the VN id appearing in the URL. */
function assetFetch(perId: Record<string, () => Response> = {}, refreshGlobalSpy?: () => void) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/refresh/global')) {
      refreshGlobalSpy?.();
      return Promise.resolve(json({ ok: true }));
    }
    const match = url.match(/\/api\/collection\/(v\d+)\/assets/);
    if (match && method === 'POST') {
      const id = match[1];
      return Promise.resolve(perId[id] ? perId[id]() : json({ ok: true }));
    }
    return Promise.resolve(json({}));
  });
}

describe('BulkDownloadButton', () => {
  beforeEach(() => {
    refreshSpy.mockClear();
    navState.search = '';
    navState.pathname = '/';
    global.fetch = assetFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the default CTA and toggles the dropdown menu open', async () => {
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: /Download all/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Download missing/ })).not.toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Full re-download/ })).not.toBeNull();
  });

  it('hides the Selective menu item when an itemsOverride is supplied', async () => {
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    expect(screen.queryByRole('menuitem', { name: /Selective/ })).toBeNull();
  });

  it('shows the Selective menu item with no override and opens the dialog', async () => {
    // No override -> selective is available. The dialog loads the collection.
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: [], pagination: { page: 1, page_size: 500, returned: 0, has_more: false } }));
      }
      return Promise.resolve(json({}));
    });
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Selective/ }));
    expect(await screen.findByRole('dialog')).not.toBeNull();
  });

  it('closes the selective dialog on Escape', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: [], pagination: { page: 1, page_size: 500, returned: 0, has_more: false } }));
      }
      return Promise.resolve(json({}));
    });
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Selective/ }));
    expect(await screen.findByRole('dialog')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the selective dialog after a successful pick + submit', async () => {
    const selectiveRow = {
      id: 'v90040',
      title: 'Pickable Title',
      alttitle: null,
      released: null,
      status: null,
      rating: null,
      user_rating: null,
      playtime_minutes: null,
      added_at: null,
      updated_at: null,
    };
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: [selectiveRow], pagination: { page: 1, page_size: 500, returned: 1, has_more: false } }));
      }
      if (url.startsWith('/api/collection/full-download') && method === 'POST') {
        return Promise.resolve(json({ queued: 1 }));
      }
      return Promise.resolve(json({}));
    });
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Selective/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Pickable Title');
    await user.click(within(dialog).getByRole('button', { name: /^Pickable Title/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Run (1)' }));
    // onSubmitDone closes the dialog so progress lands on the status bar.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses a custom label when provided', () => {
    renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} label="Sync editions" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Sync editions' })).not.toBeNull();
  });

  it('disables the trigger when the override is an empty list', () => {
    renderWithProviders(<BulkDownloadButton itemsOverride={[]} />, { locale: 'en' });
    expect(screen.getByRole('button', { name: /Download all/ }).hasAttribute('disabled')).toBe(true);
  });

  it('runs the missing flow over the override list, posting per VN without ?refresh=true', async () => {
    const fetchMock = assetFetch();
    global.fetch = fetchMock;
    const onItemDone = vi.fn();
    const { user } = renderWithProviders(
      <BulkDownloadButton itemsOverride={OVERRIDE} onItemDone={onItemDone} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));

    // Done panel appears with "2/2" and "all up to date".
    expect(await screen.findByText('Done')).not.toBeNull();
    expect(await screen.findByText(/all up to date/)).not.toBeNull();
    const assetCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets'));
    expect(assetCalls).toHaveLength(2);
    expect(assetCalls.every((c) => !String(c[0]).includes('refresh=true'))).toBe(true);
    expect(onItemDone).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('runs the full flow with ?refresh=true and fires a global refresh', async () => {
    const globalSpy = vi.fn();
    const fetchMock = assetFetch({}, globalSpy);
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Full re-download/ }));

    expect(await screen.findByText('Done')).not.toBeNull();
    const assetCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets'));
    expect(assetCalls.every((c) => String(c[0]).includes('refresh=true'))).toBe(true);
    expect(globalSpy).toHaveBeenCalledTimes(1);
  });

  it('collects failures and offers a retry control', async () => {
    const fetchMock = assetFetch({
      v90002: () => json({ error: 'asset boom' }, 500),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));

    // One failure recorded -> "1 failure(s)" + retry button.
    expect(await screen.findByText(/1 failure/)).not.toBeNull();
    const retry = await screen.findByRole('button', { name: /Retry 1 failed/ });
    expect(retry).not.toBeNull();
    // Expand the failures disclosure to reveal the failing id + message.
    fireEvent.click(screen.getByText(/View failures/));
    expect(await screen.findByText(/v90002: asset boom/)).not.toBeNull();
  });

  it('aggregates an EGS warning surfaced by a successful item', async () => {
    const fetchMock = assetFetch({
      v90001: () => json({ ok: true, egs_warning: { kind: 'server', status: 503 } }),
    });
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText(/EGS server error/)).not.toBeNull();
  });

  it('dismisses the result panel after a finished run', async () => {
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));
    expect(await screen.findByText('Done')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Done')).toBeNull());
  });

  it('stops a run in progress when the stop button is pressed', async () => {
    // Hold the first asset POST open so the run is observably "running".
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
    const { user } = renderWithProviders(<BulkDownloadButton itemsOverride={OVERRIDE} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Download missing/ }));

    const stopBtn = await screen.findByRole('button', { name: 'Stop' });
    await user.click(stopBtn);
    // Let the in-flight request settle after the abort was requested.
    releaseFirst(json({ ok: true }));
    expect(await screen.findByText('Stopped')).not.toBeNull();
  });

  it('retries only the failed VNs from the previous pass', async () => {
    let phase = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/refresh/global')) return Promise.resolve(json({ ok: true }));
      const match = url.match(/\/api\/collection\/(v\d+)\/assets/);
      if (match && method === 'POST') {
        // First pass: v90002 fails. Retry pass: it succeeds.
        if (match[1] === 'v90002' && phase === 0) return Promise.resolve(json({ error: 'first boom' }, 500));
        return Promise.resolve(json({ ok: true }));
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
    await user.click(retry);

    // The retry pass posts only the previously failed VN.
    await waitFor(() => {
      const retried = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/assets'));
      expect(retried).toHaveLength(1);
      expect(String(retried[0][0])).toContain('v90002');
    });
    // After a clean retry there are no failures left.
    expect(await screen.findByText(/all up to date/)).not.toBeNull();
  });

  it('switches the selective dialog description to the prefilled hint when URL filters are present', async () => {
    navState.search = 'status=playing&tag=g90';
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/collection?')) {
        return Promise.resolve(json({ items: [], pagination: { page: 1, page_size: 500, returned: 0, has_more: false } }));
      }
      return Promise.resolve(json({}));
    });
    const { user } = renderWithProviders(<BulkDownloadButton />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Download all/ }));
    await user.click(screen.getByRole('menuitem', { name: /Selective/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Your library filters are pre-applied/)).not.toBeNull();
  });
});
