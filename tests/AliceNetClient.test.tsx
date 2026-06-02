// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AliceNetClient } from '@/components/AliceNetClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { AliceNetClientItem, AliceNetClientStats } from '@/lib/alicenet-client-shape';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/alicenet',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeItem(overrides: Partial<AliceNetClientItem> = {}): AliceNetClientItem {
  return {
    code: '001-000001-001',
    title: 'Stock Title One',
    jan: null,
    release_date: '2018/05/25',
    list_price: '¥8,800',
    sale_price: '¥4,270',
    vn_id: null,
    vn_match_source: null,
    vn_candidates: null,
    search_title: null,
    egs_id: null,
    egs_match_source: null,
    egs_title: null,
    egs_brand: null,
    egs_release_date: null,
    egs_image_url: null,
    egs_vndb_raw: null,
    in_collection: 0,
    in_wishlist: 0,
    last_matched_at: null,
    fetched_at: 1700000000,
    updated_at: 1700000000,
    vn_image_url: null,
    vn_local_image: null,
    vn_image_sexual: null,
    vn_developers: null,
    ...overrides,
  };
}

function makeStats(overrides: Partial<AliceNetClientStats> = {}): AliceNetClientStats {
  return {
    total: 0,
    matched: 0,
    vndb_matched: 0,
    egs_only: 0,
    unmatched: 0,
    unprocessed: 0,
    none_found: 0,
    in_collection: 0,
    in_wishlist: 0,
    ...overrides,
  };
}

function snapshot(opts: {
  items?: AliceNetClientItem[];
  stats?: Partial<AliceNetClientStats>;
  pending?: { vndb_pending: number; egs_pending: number };
  last_fetch?: number | null;
} = {}) {
  const items = opts.items ?? [];
  return {
    items,
    stats: makeStats({ total: items.length, ...opts.stats }),
    pending: opts.pending ?? { vndb_pending: 0, egs_pending: 0 },
    last_fetch: opts.last_fetch ?? 1700000000,
  };
}

/** Render the client wrapped in the display-settings provider it depends on. */
function renderClient() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <AliceNetClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

/** The browsing tabs live in a role="group" labelled by the "All" filter string. */
function tabsGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'All' });
}

const VNDB_ITEM = makeItem({
  code: '001-000002-001',
  title: 'Matched Title Two',
  vn_id: 'v90001',
  vn_match_source: 'auto',
  vn_developers: JSON.stringify([{ id: 'p90001', name: 'Studio X' }]),
  in_collection: 1,
});

const EGS_ITEM = makeItem({
  code: '001-000003-001',
  title: 'Egs Title Three',
  egs_id: 55555,
  egs_match_source: 'auto',
  egs_brand: 'Brand Z',
  in_wishlist: 1,
});

beforeEach(() => {
  replace.mockClear();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  global.fetch = vi.fn(async () => json(snapshot()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AliceNetClient', () => {
  it('shows skeletons while the initial snapshot loads, then the empty state', async () => {
    let resolve!: (r: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const { container } = renderClient();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolve(json(snapshot()));
    await waitFor(() =>
      expect(screen.getByText('No stock downloaded yet. Click "Download" to fetch the latest AliceNet inventory.')).toBeInTheDocument(),
    );
  });

  it('renders populated cards with the matched and egs-only status badges', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1, in_collection: 1, in_wishlist: 1 } })),
    );
    renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();
    expect(screen.getAllByText('VNDB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EGS only').length).toBeGreaterThan(0);
  });

  it('loads a second page when the first snapshot reports has_more', async () => {
    const page1 = {
      ...snapshot({ items: [VNDB_ITEM], stats: { total: 2, matched: 1, vndb_matched: 1 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    const page2 = { items: [EGS_ITEM], page: { offset: 1, limit: 1, total: 2, has_more: false } };
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('offset=1')) return json(page2);
      return json(page1);
    });
    renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(await screen.findByText('Egs Title Three')).toBeInTheDocument();
  });

  it('filters by the VNDB tab', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(within(tabsGroup()).getByRole('button', { name: /^VNDB/ }));
    await waitFor(() => expect(screen.queryByText('Egs Title Three')).toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('filters by the debounced search input', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.type(screen.getByLabelText('Filter by title, code...'), 'Egs Title');
    await waitFor(() => expect(screen.queryByText('Matched Title Two')).toBeNull());
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();
  });

  it('filters by year range', async () => {
    const old = makeItem({ code: '001-000004-001', title: 'Old Title', release_date: '2005/01/01' });
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM, old] })));
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.type(screen.getByLabelText('Min year'), '2010');
    await waitFor(() => expect(screen.queryByText('Old Title')).toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('switches to the list view', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(document.querySelector('li')).not.toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('groups by match status', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.selectOptions(screen.getByLabelText('Group'), 'match');
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it('changes sort order without throwing', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.selectOptions(screen.getByLabelText('Sort'), 'title');
    await user.selectOptions(screen.getByLabelText('Sort'), 'price_desc');
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('runs the sync-stock single operation', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        calls.push(u);
        return json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000001 });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(calls).toContain('/api/alicenet/fetch'));
  });

  it('runs the match operation loop and renders the last-run summary', async () => {
    const matchCalls: unknown[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') {
        matchCalls.push(JSON.parse(String(init.body)));
        return json({ processed: 3, matched: 2, remaining: 0 });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1, unprocessed: 3 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: /Match new rows/ }));
    await waitFor(() => expect(matchCalls.length).toBeGreaterThan(0));
    expect(await screen.findByText(/3 processed, 2 matched/)).toBeInTheDocument();
  });

  it('runs the full download-all pipeline in order', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') calls.push(u);
      if (u === '/api/alicenet/fetch') return json({ count: 2, added: 1, updated: 1, removed: 1, fetched_at: 1700000002 });
      if (
        u === '/api/alicenet/match-next' ||
        u === '/api/alicenet/match-vndb-from-egs' ||
        u === '/api/alicenet/download-vndb' ||
        u === '/api/alicenet/resolve-egs'
      ) {
        return json({ processed: 1, matched: 1, remaining: 0 });
      }
      return json(snapshot({
        items: [VNDB_ITEM, EGS_ITEM],
        stats: { matched: 2, vndb_matched: 1, egs_only: 1, unprocessed: 1, none_found: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(calls).toContain('/api/alicenet/resolve-egs'));
    expect(calls).toEqual([
      '/api/alicenet/fetch',
      '/api/alicenet/match-next',
      '/api/alicenet/match-next',
      '/api/alicenet/match-vndb-from-egs',
      '/api/alicenet/download-vndb',
      '/api/alicenet/resolve-egs',
    ]);
  });

  it('stops an active operation through the progress toolbar', async () => {
    let aborted = false;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(aborted).toBe(true));
  });

  it('runs recovery and data operation variants from visible controls', async () => {
    const endpoints: string[] = [];
    const noneItem = makeItem({
      code: '001-000010-001',
      title: 'No Result Title',
      vn_match_source: 'none',
    });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') endpoints.push(u);
      if (
        u === '/api/alicenet/match-next' ||
        u === '/api/alicenet/match-vndb-from-egs' ||
        u === '/api/alicenet/search-egs-no-vndb' ||
        u === '/api/alicenet/download-vndb' ||
        u === '/api/alicenet/resolve-egs'
      ) {
        return json({ processed: 1, matched: 1, remaining: 0 });
      }
      return json(snapshot({
        items: [EGS_ITEM, noneItem],
        stats: { total: 2, matched: 1, egs_only: 1, unmatched: 1, none_found: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      }));
    });
    const { user } = renderClient();
    await screen.findByText('Egs Title Three');
    await user.click(screen.getAllByRole('button', { name: /Recover no-result rows/ })[0]);
    await waitFor(() => expect(endpoints).toContain('/api/alicenet/match-next'));
    await user.click(screen.getByRole('button', { name: /Download VNDB data/ }));
    await waitFor(() => expect(endpoints).toContain('/api/alicenet/download-vndb'));
    await user.click(screen.getByRole('button', { name: /Resolve EGS via VNDB/ }));
    await waitFor(() => expect(endpoints).toContain('/api/alicenet/resolve-egs'));
    await user.click(within(tabsGroup()).getByRole('button', { name: /No VNDB result/ }));
    await user.click(screen.getByRole('button', { name: /VNDB from EGS/ }));
    await waitFor(() => expect(endpoints).toContain('/api/alicenet/match-vndb-from-egs'));
    await user.click(screen.getByRole('button', { name: /^Search on EGS$/ }));
    await waitFor(() => expect(endpoints.filter((endpoint) => endpoint === '/api/alicenet/search-egs-no-vndb').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: /Search on EGS \(aggressive filter\)/ }));
    await waitFor(() => expect(endpoints.filter((endpoint) => endpoint === '/api/alicenet/search-egs-no-vndb').length).toBeGreaterThan(1));
  });

  it('renders operation errors as the last-run summary', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') return json({ error: 'match-loop-failed' }, 500);
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1, unprocessed: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: /Match new rows/ }));
    expect(await screen.findAllByText(/match-loop-failed/)).toHaveLength(2);
  });

  it('resets auto matches after confirmation', async () => {
    let resetCalled = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/reset-matches' && init?.method === 'POST') {
        resetCalled = true;
        return json({ cleared: 2 });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Reset auto-matches' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(resetCalled).toBe(true));
  });

  it('clears a single VN link from a card after confirmation', async () => {
    let deleteUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        deleteUrl = u;
        return json({ ok: true });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Matched Title Two')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Clear' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(deleteUrl).toBe('/api/alicenet/001-000002-001/link'));
  });

  it('opens the lazy match dialog from a card', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json(snapshot({ items: [EGS_ITEM], stats: { egs_only: 1, matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Egs Title Three')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('enters select mode, selects all, and bulk-clears links with confirmation', async () => {
    const deletes: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        deletes.push(u);
        return json({ ok: true });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(deletes).toContain('/api/alicenet/001-000002-001/link'));
  });

  it('selects only matched rows and clears that selection', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { total: 2, matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select VNDB-linked' }));
    expect(screen.getAllByText('1 selected').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Select Matched Title Two' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select Egs Title Three' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getAllByRole('button', { name: 'Clear selection' })[0]);
    await waitFor(() => expect(screen.queryByText('1 selected')).toBeNull());
  });

  it('filters by producer and price, then resets filters', async () => {
    const cheap = makeItem({ code: '001-000011-001', title: 'Cheap Brand Title', sale_price: '¥1,000', egs_brand: 'Budget Brand' });
    global.fetch = vi.fn(async () =>
      json(snapshot({
        items: [VNDB_ITEM, EGS_ITEM, cheap],
        stats: { total: 3, matched: 2, vndb_matched: 1, egs_only: 1 },
      })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.selectOptions(screen.getByLabelText('Producer'), 'p90001');
    await waitFor(() => expect(screen.queryByText('Egs Title Three')).toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Producer'), '');
    await user.type(screen.getByLabelText('Max price'), '2000');
    await waitFor(() => expect(screen.queryByText('Matched Title Two')).toBeNull());
    expect(screen.getByText('Cheap Brand Title')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.getByText('Matched Title Two')).toBeInTheDocument());
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();
  });

  it('persists view preferences and restores them on the next mount', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    const first = renderClient();
    await screen.findByText('Matched Title Two');
    await first.user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(window.localStorage.getItem('vncoll.alicenet.prefs.v1')).toContain('"view":"list"'));
    first.unmount();

    renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent');
  });

  it('renders the virtual-scroll notice for large card lists', async () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      makeItem({
        code: `001-${String(index + 20).padStart(6, '0')}-001`,
        title: `Bulk Title ${index + 1}`,
      }),
    );
    global.fetch = vi.fn(async () => json(snapshot({ items: many, stats: { total: many.length } })));
    renderClient();
    expect(await screen.findByText(/100 items - virtual scroll active/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-virtualized-alicenet-grid="true"]')).not.toBeNull());
  });

  it('remaps via a candidate chip', async () => {
    const remapItem = makeItem({
      code: '001-000009-001',
      title: 'Remap Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Cand One', alttitle: null, released: null },
        { id: 'v90002', title: 'Cand Two', alttitle: null, released: null },
      ]),
    });
    let remapBody: unknown = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') {
        remapBody = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      return json(snapshot({ items: [remapItem], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Remap Title')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'v90002' }));
    await waitFor(() => expect(remapBody).toEqual({ vn_id: 'v90002' }));
  });

  it('shows an error toast when the initial load fails', async () => {
    global.fetch = vi.fn(async () => json({ error: 'load failed' }, 500));
    renderClient();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('load failed');
  });

  it('renders the empty-for-filter state when the filter excludes everything', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [EGS_ITEM], stats: { total: 1, egs_only: 1, matched: 1, vndb_matched: 0 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Egs Title Three');
    await user.click(within(tabsGroup()).getByRole('button', { name: /^VNDB/ }));
    expect(
      await screen.findByText('No item matches the current filters. Widen the query or reset the filters.'),
    ).toBeInTheDocument();
  });
});
