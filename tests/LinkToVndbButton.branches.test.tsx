// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { LinkToVndbButton } from '@/components/LinkToVndbButton';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const RESULTS = {
  results: [
    { id: 'v90001', title: 'Title Y', released: '2018-05-04', developers: [{ id: 'p90001', name: 'Studio X' }, { id: 'p90002', name: 'Studio Z' }] },
    { id: 'v90002', title: 'Title Z', released: null },
  ],
};

interface Handlers {
  search?: () => Response;
  link?: (body: unknown) => Response;
}

function installFetch(h: Handlers) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('/api/search')) return h.search ? h.search() : json(RESULTS);
    if (u.includes('/link-vndb') && init?.method === 'POST') {
      return h.link ? h.link(JSON.parse(String(init.body))) : json({ ok: true });
    }
    return json({});
  });
}

function renderBtn(props: Partial<React.ComponentProps<typeof LinkToVndbButton>> = {}) {
  return renderWithProviders(
    <LinkToVndbButton vnId="egs_5" seedQuery="Title Y" {...props} />,
    { locale: 'en' },
  );
}

describe('LinkToVndbButton branches', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    installFetch({});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the trigger with a custom class and the keep-menu-open data attribute', () => {
    renderBtn({ triggerClassName: 'my-trigger', keepMenuOpen: true });
    const trigger = screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) });
    expect(trigger).toHaveClass('my-trigger');
    expect(trigger).toHaveAttribute('data-menu-keep-open');
  });

  it('opens the dialog, runs the seeded search, and lists hits with developers', async () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Title Y')).toBeInTheDocument();
    expect(within(dialog).getByText('Title Z')).toBeInTheDocument();
    // Developers (max 2) rendered on the first hit.
    expect(within(dialog).getByText('Studio X')).toBeInTheDocument();
    expect(within(dialog).getByText('Studio Z')).toBeInTheDocument();
  });

  it('shows the empty copy when the search returns no hits', async () => {
    installFetch({ search: () => json({ results: [] }) });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(t.linkVndb.empty)).toBeInTheDocument();
  });

  it('keeps the hit list empty when the search responds non-ok', async () => {
    installFetch({ search: () => json({ error: 'search failed' }, 500) });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    // Non-ok search is swallowed; the empty copy remains.
    expect(await within(dialog).findByText(t.linkVndb.empty)).toBeInTheDocument();
  });

  it('confirms, links the chosen VN, and navigates to the new id', async () => {
    let linkBody: unknown = null;
    installFetch({ link: (body) => { linkBody = body; return json({ ok: true }); } });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    fireEvent.click(within(dialog).getAllByRole('button', { name: new RegExp(t.linkVndb.useThis) })[0]);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(linkBody).toEqual({ vndb_id: 'v90001' }));
    await waitFor(() => expect(screen.getByText(t.linkVndb.done)).toBeInTheDocument());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/vn/v90001'));
  });

  it('does not link when the confirmation is cancelled', async () => {
    let linkCalled = false;
    installFetch({ link: () => { linkCalled = true; return json({ ok: true }); } });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    fireEvent.click(within(dialog).getAllByRole('button', { name: new RegExp(t.linkVndb.useThis) })[0]);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(linkCalled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('toasts when the link request fails', async () => {
    installFetch({ link: () => json({ error: 'link failed' }, 500) });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    fireEvent.click(within(dialog).getAllByRole('button', { name: new RegExp(t.linkVndb.useThis) })[0]);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText('link failed')).toBeInTheDocument();
  });

  it('closes via the header close button', async () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when the backdrop is clicked', async () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    // The outermost fixed overlay is the backdrop click target.
    const overlay = dialog.parentElement as HTMLElement;
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clears the hit list and skips the fetch when the seed query is blank', async () => {
    let searchCalled = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) { searchCalled = true; return json(RESULTS); }
      return json({});
    });
    renderBtn({ seedQuery: '' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    // Empty query short-circuits before any /api/search call.
    expect(await within(dialog).findByText(t.linkVndb.empty)).toBeInTheDocument();
    expect(searchCalled).toBe(false);
  });

  it('swallows an aborted search rejection without toasting', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return json({});
    });
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    // AbortError-named rejection takes the silent early-return branch.
    expect(await within(dialog).findByText(t.linkVndb.empty)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens the external VNDB link without bubbling to the row', async () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    const external = within(dialog).getAllByRole('link', { name: t.linkVndb.openVndb })[0];
    expect(external).toHaveAttribute('href', 'https://vndb.org/v90001');
    fireEvent.click(external);
    // The dialog stays open (the stopPropagation handler ran).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('aborts an in-flight search when a fresh search starts', async () => {
    vi.useFakeTimers();
    const aborted: boolean[] = [];
    try {
      global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).startsWith('/api/search')) {
          // Never resolve, so the first search's abort controller stays
          // registered; the follow-up search must abort it (lines 51-52).
          const signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              aborted.push(true);
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }
        return Promise.resolve(json({}));
      });
      renderBtn();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
      await vi.waitFor(() => screen.getByRole('dialog'));
      const input = within(screen.getByRole('dialog')).getByLabelText(t.linkVndb.searchPlaceholder);
      // First search is in flight (open effect). Type to schedule a second.
      fireEvent.change(input, { target: { value: 'second query' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(aborted.length).toBeGreaterThan(0));
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('debounces a typed query before issuing the follow-up search', async () => {
    vi.useFakeTimers();
    try {
      const seen: string[] = [];
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.startsWith('/api/search')) {
          seen.push(decodeURIComponent(u));
          return json(RESULTS);
        }
        return json({});
      });
      renderBtn();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
      const dialog = await vi.waitFor(() => screen.getByRole('dialog'));
      const input = within(dialog).getByLabelText(t.linkVndb.searchPlaceholder);
      fireEvent.change(input, { target: { value: 'fresh query' } });
      // Nothing fires until the debounce window elapses.
      await act(async () => { await vi.advanceTimersByTimeAsync(299); });
      const beforeAdvance = seen.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await vi.waitFor(() => expect(seen.some((u) => u.includes('fresh query'))).toBe(true));
      expect(seen.length).toBeGreaterThan(beforeAdvance);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
