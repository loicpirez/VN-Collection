// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BulkDownloadButton } from '@/components/BulkDownloadButton';

const refreshSpy = vi.fn();
const navState = { search: '' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshSpy, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
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
});
