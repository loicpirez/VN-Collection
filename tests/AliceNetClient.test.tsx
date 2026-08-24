// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AliceNetClient } from '@/components/AliceNetClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { AliceNetClientItem, AliceNetClientStats } from '@/lib/alicenet-client-shape';

const replace = vi.fn();
let mockedSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/places/7',
  useSearchParams: () => mockedSearchParams,
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
    last_fetch: opts.last_fetch === undefined ? 1700000000 : opts.last_fetch,
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

/** Render the embedded shop-page variant with the same providers. */
function renderEmbeddedClient() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <AliceNetClient embedded basePath="/places/7" />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

/** The browsing tabs live in a role="group" labelled by the "All" filter string. */
function tabsGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'All' });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  mockedSearchParams = new URLSearchParams();
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
  vi.unstubAllGlobals();
  try {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  } catch {
    /* ignore */
  }
});

describe('AliceNetClient', () => {
  it('shows skeletons while the initial snapshot loads, then the empty state', async () => {
    let resolve!: (r: Response) => void;
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') {
        return Promise.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
      }
      return new Promise<Response>((r) => { resolve = r; });
    }) as unknown as typeof fetch;
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

  it('uses the producer facets returned by the server snapshot', async () => {
    global.fetch = vi.fn(async () => json({
      ...snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }),
      producers: [{ id: 'p-server', name: 'Server Producer', count: 7 }],
    }));

    renderClient();
    await screen.findByText('Matched Title Two');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producer' }));
    expect(screen.getByRole('option', { name: /^Server Producer\s*7$/ })).toBeInTheDocument();
  });

  it('shows the not-yet-matched breakdown in the no-result stat tile', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({
        items: [VNDB_ITEM],
        stats: { total: 3, matched: 1, vndb_matched: 1, unmatched: 2, unprocessed: 2, none_found: 1 },
      })),
    );
    renderClient();
    await screen.findByText('Matched Title Two');
    expect(await screen.findByText('2 Not yet matched')).toBeInTheDocument();
  });

  it('loads the next server page only after the operator requests it', async () => {
    const page1 = {
      ...snapshot({ items: [VNDB_ITEM], stats: { total: 2, matched: 1, vndb_matched: 1 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    const page2 = {
      ...snapshot({ items: [EGS_ITEM], stats: { total: 2, matched: 2, vndb_matched: 1, egs_only: 1 } }),
      page: { offset: 96, limit: 96, total: 97, has_more: false },
    };
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('offset=96')) return json(page2);
      return json(page1);
    });
    const { user } = renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.queryByText('Egs Title Three')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Egs Title Three')).toBeInTheDocument();
    expect(screen.queryByText('Matched Title Two')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.queryByText('Egs Title Three')).toBeNull();
  });

  it('normalizes an invalid page query to the first server page', async () => {
    mockedSearchParams = new URLSearchParams('page=invalid');
    const requestedUrls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.startsWith('/api/alicenet')) requestedUrls.push(value);
      if (value === '/api/download-status') {
        return json({ throttle: { active: 0, queued: 0 }, jobs: [] });
      }
      return json(snapshot());
    });

    renderClient();
    await screen.findByText('No stock downloaded yet. Click "Download" to fetch the latest AliceNet inventory.');
    expect(requestedUrls).toContain('/api/alicenet');
    expect(requestedUrls.some((url) => url.includes('offset='))).toBe(false);
  });

  it('labels a snapshot whose wishlist source was unavailable', async () => {
    global.fetch = vi.fn(async () => json({
      ...snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }),
      wishlist_available: false,
    }));

    renderClient();
    expect(await screen.findByText('VNDB wishlist unavailable for this refresh')).toBeInTheDocument();
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

  it('filters by matched, EGS-only, unmatched, and no-result tabs', async () => {
    const unmatched = makeItem({ code: '001-000004-001', title: 'Unmatched Title' });
    const none = makeItem({ code: '001-000005-001', title: 'No Result Title', vn_match_source: 'none' });
    global.fetch = vi.fn(async () =>
      json(snapshot({
        items: [VNDB_ITEM, EGS_ITEM, unmatched, none],
        stats: { total: 4, matched: 2, vndb_matched: 1, egs_only: 1, unmatched: 2, none_found: 1 },
      })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');

    await user.click(within(tabsGroup()).getByRole('button', { name: /^Matched/ }));
    await waitFor(() => expect(screen.queryByText('Unmatched Title')).toBeNull());
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();

    await user.click(within(tabsGroup()).getByRole('button', { name: /^EGS only/ }));
    await waitFor(() => expect(screen.queryByText('Matched Title Two')).toBeNull());
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();

    await user.click(within(tabsGroup()).getByRole('button', { name: /^Unmatched/ }));
    await waitFor(() => expect(screen.queryByText('Egs Title Three')).toBeNull());
    expect(screen.getByText('Unmatched Title')).toBeInTheDocument();
    expect(screen.getByText('No Result Title')).toBeInTheDocument();

    await user.click(within(tabsGroup()).getByRole('button', { name: /^No VNDB result/ }));
    await waitFor(() => expect(screen.queryByText('Unmatched Title')).toBeNull());
    expect(screen.getByText('No Result Title')).toBeInTheDocument();
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

  it('hydrates valid URL state, hidden filters, and list view', async () => {
    mockedSearchParams = new URLSearchParams('filter=egs_only&sort=price_asc&group=year&view=list&filters=0&q=Egs');
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM, EGS_ITEM], stats: { total: 2, matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    renderClient();
    expect(await screen.findByText('Egs Title Three')).toBeInTheDocument();
    expect(screen.queryByText('Matched Title Two')).toBeNull();
    expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent');
    expect(screen.getByLabelText('Sort')).toHaveValue('price_asc');
    expect(screen.getByLabelText('Group')).toHaveValue('year');
    expect(screen.queryByLabelText('Producer')).toBeNull();
  });

  it('filters by year range', async () => {
    const old = makeItem({ code: '001-000004-001', title: 'Old Title', release_date: '2005/01/01' });
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM, old] })));
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.type(screen.getByLabelText('Min year'), '2010');
    await waitFor(() => expect(screen.queryByText('Old Title')).toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('applies max-year and min-price filters', async () => {
    const oldCheap = makeItem({ code: '001-000012-001', title: 'Old Cheap Title', release_date: '2008/01/01', sale_price: '¥900' });
    const oldExpensive = makeItem({ code: '001-000013-001', title: 'Old Expensive Title', release_date: '2008/01/01', sale_price: '¥3,000' });
    const modern = makeItem({ code: '001-000014-001', title: 'Modern Title', release_date: '2022/01/01', sale_price: '¥5,000' });
    global.fetch = vi.fn(async () => json(snapshot({ items: [oldCheap, oldExpensive, modern], stats: { total: 3 } })));
    const { user } = renderClient();
    await screen.findByText('Old Cheap Title');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.type(screen.getByLabelText('Max year'), '2010');
    await waitFor(() => expect(screen.queryByText('Modern Title')).toBeNull());
    await user.type(screen.getByLabelText('Min price'), '2000');
    await waitFor(() => expect(screen.queryByText('Old Cheap Title')).toBeNull());
    expect(screen.getByText('Old Expensive Title')).toBeInTheDocument();
  });

  it('switches to the list view', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(document.querySelector('li')).not.toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
  });

  it('restores invalid saved preferences as defaults and renders the embedded shop section', async () => {
    window.localStorage.setItem('vncoll.alicenet.prefs.v1', JSON.stringify({ sort: 'bad-sort', group: 'bad-group', view: 'bad-view' }));
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    renderEmbeddedClient();
    expect(await screen.findByRole('heading', { level: 2, name: 'Stock AliceNet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveClass('bg-accent');
    expect(screen.getByLabelText('Sort')).toHaveValue('match_status');
    expect(screen.getByLabelText('Group')).toHaveValue('none');
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

  it('starts each server operation from its toolbar button', async () => {
    const posts: { op: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return json({ jobId: 'job-1', op: JSON.parse(String(init.body)).op }, 202);
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');

    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    expect(await screen.findByText('Started in the background. Track it in the Downloads bar.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await user.click(screen.getByRole('button', { name: 'Match VNDB' }));
    await user.click(screen.getByRole('button', { name: 'Match EGS' }));

    await waitFor(() => expect(posts.length).toBe(4));
    expect(posts.map((p) => p.op)).toEqual(['download', 'pipeline', 'match-vndb', 'match-egs']);
  });

  it('shows an error toast when the run route rejects the operation', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') {
        return json({ error: 'an AliceNet operation is already running', code: 'queue_full' }, 429);
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('An AliceNet operation is already running. Wait for it to finish or stop it.');
  });

  it('reports a malformed accepted-operation response', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/alicenet/run' && init?.method === 'POST') return json({ accepted: true });
      if (value === '/api/download-status') {
        return json({ throttle: { active: 0, queued: 0 }, jobs: [] });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server accepted the operation but returned an invalid response.');
  });

  it('renders active job progress, errors, current item, and sends a stop request', async () => {
    const deletes: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-1', kind: 'alicenet', vn_id: null, label: 'AliceNet pipeline',
            total: 10, done: 4, current_item: 'Batch 5', errors: [{
              item: 'AliceNet stock download',
              item_code: 'alicenet_phase_stock',
              message: 'raw upstream message',
              code: 'alicenet_upstream_unavailable',
            }],
            started_at: 10, finished_at: null,
          }, {
            id: 'alice-job-older', kind: 'alicenet', vn_id: null, label: 'Older AliceNet pipeline',
            total: 10, done: 1, current_item: null, errors: [], started_at: 5, finished_at: null,
          }],
        });
      }
      if (value === '/api/alicenet/run?jobId=alice-job-1' && init?.method === 'DELETE') {
        deletes.push(value);
        return json({ cancelled: 'alice-job-1' });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    expect(await screen.findByText('AliceNet pipeline')).toBeInTheDocument();
    expect(screen.queryByText('Older AliceNet pipeline')).toBeNull();
    expect(screen.getByText('Batch 5')).toBeInTheDocument();
    expect(screen.getByText('4/10 (40%)')).toBeInTheDocument();
    expect(screen.getByText('1 error(s)')).toBeInTheDocument();
    expect(screen.getByText(/AliceNet \/ stock download/)).toBeInTheDocument();
    expect(screen.getByText('AliceNet is temporarily unavailable. Retry later or check the AliceNet proxy.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'AliceNet progress' })).toHaveAttribute('aria-valuenow', '4');

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(deletes).toEqual(['/api/alicenet/run?jobId=alice-job-1']));
    expect(await screen.findByText('Stop requested. The operation will stop after the current batch.')).toBeInTheDocument();
  });

  it('renders a finished source outage without a lingering loading animation', async () => {
    let statusCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') {
        statusCalls += 1;
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-failed',
            kind: 'alicenet',
            vn_id: null,
            label: 'AliceNet stock download',
            label_code: 'alicenet_download',
            total: 0,
            done: 0,
            current_item: null,
            errors: [{
              item: 'AliceNet stock download',
              item_code: 'alicenet_phase_stock',
              message: 'raw HTTP 503',
              code: 'alicenet_upstream_unavailable',
            }, {
              item: 'Fallback phase',
              message: 'Fallback message',
            }, {
              item: 'Unknown phase',
              item_code: 'unknown_phase',
              message: 'Unknown coded message',
              code: 'unknown_error',
            }, {
              item: 'Hidden phase',
              message: 'Hidden message',
            }],
            started_at: 10,
            finished_at: statusCalls > 1 ? 20 : null,
          }],
        });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    await screen.findByText('AliceNet stock download');
    expect(await screen.findByText('Operation finished with errors', {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByText('AliceNet is temporarily unavailable. Retry later or check the AliceNet proxy.')).toBeInTheDocument();
    expect(screen.getByText(/Fallback phase/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown phase/)).toBeInTheDocument();
    expect(screen.getByText('1 more error(s)')).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'AliceNet progress' });
    expect(progress.firstElementChild).not.toHaveClass('animate-pulse');
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Operation finished with errors')).toBeNull();
  });

  it('announces a cancelled background operation after it stops', async () => {
    let statusCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') {
        statusCalls += 1;
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-cancelled',
            kind: 'alicenet',
            vn_id: null,
            label: 'AliceNet EGS match',
            total: 5,
            done: 2,
            current_item: statusCalls > 1 ? null : 'Batch 3',
            errors: [],
            cancelled: statusCalls > 1,
            started_at: 10,
            finished_at: statusCalls > 1 ? 20 : null,
          }],
        });
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    renderClient();
    await screen.findByText('AliceNet EGS match');
    expect(await screen.findByText('Cancelled', {}, { timeout: 3_000 })).toBeInTheDocument();
  });

  it('shows the localized fallback when stopping a job rejects with a non-Error value', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-stop-error', kind: 'alicenet', vn_id: null, label: 'AliceNet stop failure',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        });
      }
      if (value === '/api/alicenet/run?jobId=alice-job-stop-error' && init?.method === 'DELETE') {
        throw 'raw stop failure';
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    await screen.findByText('AliceNet stop failure');
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
  });

  it('shows the localized operation fallback when the stop route returns a legacy error', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-http-error', kind: 'alicenet', vn_id: null, label: 'AliceNet HTTP stop failure',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        });
      }
      if (value === '/api/alicenet/run?jobId=alice-job-http-error' && init?.method === 'DELETE') {
        return json({ error: 'Unable to stop this operation' }, 503);
      }
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    await screen.findByText('AliceNet HTTP stop failure');
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AliceNet operation could not be stopped.');
  });

  it('deduplicates stop requests while the first request is pending', async () => {
    const stopRequest = deferredResponse();
    let deleteCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return Promise.resolve(json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-stop-pending', kind: 'alicenet', vn_id: null, label: 'AliceNet pending stop',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        }));
      }
      if (value === '/api/alicenet/run?jobId=alice-job-stop-pending' && init?.method === 'DELETE') {
        deleteCalls += 1;
        return stopRequest.promise;
      }
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    });

    renderClient();
    await screen.findByText('AliceNet pending stop');
    const stopButton = screen.getByRole('button', { name: 'Stop' });
    act(() => {
      fireEvent.click(stopButton);
      fireEvent.click(stopButton);
    });
    expect(deleteCalls).toBe(1);
    await act(async () => {
      stopRequest.resolve(json({ cancelled: 'alice-job-stop-pending' }));
      await flushAsyncWork();
    });
    expect(await screen.findByText('Stop requested. The operation will stop after the current batch.')).toBeInTheDocument();
  });

  it('does not update the UI when a stop request succeeds after unmount', async () => {
    const stopRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return Promise.resolve(json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-stop-unmounted', kind: 'alicenet', vn_id: null, label: 'AliceNet unmounted stop',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        }));
      }
      if (value === '/api/alicenet/run?jobId=alice-job-stop-unmounted' && init?.method === 'DELETE') return stopRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    });

    const view = renderClient();
    await screen.findByText('AliceNet unmounted stop');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    view.unmount();
    await act(async () => {
      stopRequest.resolve(json({ cancelled: 'alice-job-stop-unmounted' }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('AliceNet unmounted stop')).toBeNull();
  });

  it('does not report a stop error that arrives after unmount', async () => {
    const stopRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value === '/api/download-status') {
        return Promise.resolve(json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-stop-error-unmounted', kind: 'alicenet', vn_id: null, label: 'AliceNet unmounted stop error',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        }));
      }
      if (value === '/api/alicenet/run?jobId=alice-job-stop-error-unmounted' && init?.method === 'DELETE') return stopRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    });

    const view = renderClient();
    await screen.findByText('AliceNet unmounted stop error');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    view.unmount();
    await act(async () => {
      stopRequest.reject(new Error('late stop failure'));
      await flushAsyncWork();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the localized fallback when polling an active job rejects with a non-Error value', async () => {
    let statusCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const value = String(url);
      if (value === '/api/download-status') {
        statusCalls += 1;
        if (statusCalls > 1) return Promise.reject('raw polling failure');
        return Promise.resolve(json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-poll-error', kind: 'alicenet', vn_id: null, label: 'AliceNet polling failure',
            total: 2, done: 1, current_item: null, errors: [], started_at: 10, finished_at: null,
          }],
        }));
      }
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;

    renderClient();
    await screen.findByText('AliceNet polling failure');
    expect(await screen.findByText('Error', {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(statusCalls).toBeGreaterThan(1);
  });

  it('ignores a status snapshot that resolves after unmount', async () => {
    const statusRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') return statusRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const view = renderClient();
    await screen.findByText('Matched Title Two');
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/download-status')).toBe(true));
    view.unmount();
    await act(async () => {
      statusRequest.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Matched Title Two')).toBeNull();
  });

  it('does not schedule another poll when unmounted during the completion reload', async () => {
    const reloadRequest = deferredResponse();
    let collectionCalls = 0;
    let statusCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') {
        statusCalls += 1;
        return Promise.resolve(json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            id: 'alice-job-finished-unmount', kind: 'alicenet', vn_id: null, label: 'AliceNet finished before unmount',
            total: 1, done: statusCalls > 1 ? 1 : 0, current_item: null, errors: [], started_at: 10,
            finished_at: statusCalls > 1 ? 20 : null,
          }],
        }));
      }
      collectionCalls += 1;
      if (collectionCalls > 1) return reloadRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;

    const view = renderClient();
    await screen.findByText('Matched Title Two');
    await waitFor(() => expect(collectionCalls).toBe(2), { timeout: 3_500 });
    view.unmount();
    await act(async () => {
      reloadRequest.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
      await flushAsyncWork();
    });
    expect(screen.queryByText('AliceNet finished before unmount')).toBeNull();
  });

  it('reloads the stock snapshot when a tracked job finishes', async () => {
    let statusCalls = 0;
    let collectionCalls = 0;
    const baseJob = {
      id: 'alice-job-finish', kind: 'alicenet' as const, vn_id: null, label: 'AliceNet sync',
      total: 2, done: 1, current_item: 'Final batch', errors: [], started_at: 10,
    };
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/download-status') {
        statusCalls += 1;
        return json({
          throttle: { active: 0, queued: 0 },
          jobs: [{
            ...baseJob,
            done: statusCalls > 1 ? 2 : 1,
            finished_at: statusCalls > 1 ? 20 : null,
          }],
        });
      }
      collectionCalls += 1;
      return json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } }));
    });

    const { user } = renderClient();
    expect(await screen.findByText('AliceNet sync')).toBeInTheDocument();
    await waitFor(() => expect(collectionCalls).toBeGreaterThanOrEqual(2), { timeout: 3_500 });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('AliceNet sync')).toBeNull();
  });

  it('issues a single POST when an operation button is double-clicked', async () => {
    const runRequest = deferredResponse();
    const posts: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') {
        posts.push(u);
        return runRequest.promise;
      }
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    const sync = screen.getByRole('button', { name: 'Sync stock' });
    act(() => {
      fireEvent.click(sync);
      fireEvent.click(sync);
    });
    await waitFor(() => expect(posts).toEqual(['/api/alicenet/run']));
    await act(async () => {
      runRequest.resolve(json({ jobId: 'job-1', op: 'download' }, 202));
      await flushAsyncWork();
    });
  });

  it('disables every operation button while a run is starting', async () => {
    const runRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') return runRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download all' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Sync stock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Match VNDB' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Match EGS' })).toBeDisabled();
    await act(async () => {
      runRequest.resolve(json({ jobId: 'job-1', op: 'download' }, 202));
      await flushAsyncWork();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download all' })).toBeEnabled());
  });

  it('ignores a run-start success that resolves after unmount', async () => {
    const runRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') return runRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Matched Title Two');
    fireEvent.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync stock' })).toBeDisabled());
    view.unmount();
    await act(async () => {
      runRequest.resolve(json({ jobId: 'job-1', op: 'download' }, 202));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Started in the background. Track it in the Downloads bar.')).toBeNull();
  });

  it('ignores a run-start error that rejects after unmount', async () => {
    const runRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/run' && init?.method === 'POST') return runRequest.promise;
      return Promise.resolve(json(snapshot({ items: [VNDB_ITEM], stats: { matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Matched Title Two');
    fireEvent.click(screen.getByRole('button', { name: 'Match EGS' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Match EGS' })).toBeDisabled());
    view.unmount();
    await act(async () => {
      runRequest.reject(new Error('late run failure'));
      await flushAsyncWork();
    });
    expect(screen.queryByText('late run failure')).toBeNull();
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
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 5_000 });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
    const matchedToggle = screen.getByRole('button', { name: 'Select Matched Title Two' });
    const unmatchedToggle = screen.getByRole('button', { name: 'Select Egs Title Three' });
    expect(matchedToggle).toHaveAttribute('aria-pressed', 'true');
    expect(unmatchedToggle).toHaveAttribute('aria-pressed', 'false');
    const matchedItem = matchedToggle.closest('[role="listitem"]');
    const unmatchedItem = unmatchedToggle.closest('[role="listitem"]');
    const matchedDescription = matchedItem?.getAttribute('aria-describedby');
    const unmatchedDescription = unmatchedItem?.getAttribute('aria-describedby');
    expect(matchedDescription).toBeTruthy();
    expect(unmatchedDescription).toBeTruthy();
    expect(document.getElementById(matchedDescription ?? '')).toHaveTextContent('Item selected');
    expect(document.getElementById(unmatchedDescription ?? '')).toHaveTextContent('Item not selected');
    await user.click(screen.getAllByRole('button', { name: 'Clear selection' })[0]);
    await waitFor(() => expect(screen.queryByText('1 selected')).toBeNull());
    expect(matchedItem).not.toHaveAttribute('aria-describedby');
  });

  it('toggles an individual selected card off and on', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    const toggle = screen.getByRole('button', { name: 'Select Matched Title Two' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
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
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByLabelText('Min year')).toHaveAttribute('placeholder', 'YYYY');
    expect(screen.getByLabelText('Max year')).toHaveAttribute('placeholder', 'YYYY');
    await user.click(screen.getByRole('combobox', { name: 'Producer' }));
    await user.click(screen.getByRole('option', { name: /^Studio X\s*1$/ }));
    await waitFor(() => expect(screen.queryByText('Egs Title Three')).toBeNull());
    expect(screen.getByText('Matched Title Two')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Producer' }));
    await user.click(screen.getByRole('option', { name: 'All producers' }));
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

  it('filters to an EGS producer from the card producer action', async () => {
    const otherEgs = makeItem({
      code: '001-000016-001',
      title: 'Other EGS Brand Title',
      egs_id: 77777,
      egs_match_source: 'auto',
      egs_brand: 'Other Brand',
    });
    global.fetch = vi.fn(async () =>
      json(snapshot({
        items: [EGS_ITEM, otherEgs],
        stats: { total: 2, matched: 2, egs_only: 2 },
      })),
    );
    const { user } = renderClient();
    await screen.findByText('Egs Title Three');
    await user.click(screen.getByRole('button', { name: 'Brand Z' }));
    await waitFor(() => expect(screen.queryByText('Other EGS Brand Title')).toBeNull());
    expect(screen.getByText('Egs Title Three')).toBeInTheDocument();
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

  it('renders candidate detail titles and toasts when remapping fails', async () => {
    const remapItem = makeItem({
      code: '001-000017-001',
      title: 'Candidate Detail Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Cand One', alttitle: 'Alt One', released: '2018-01-02' },
        { id: 'v90002', title: 'Cand Two', alttitle: 'Alt Two', released: '2019-03-04' },
      ]),
    });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') return json({ error: 'candidate failed' }, 500);
      return json(snapshot({ items: [remapItem], stats: { matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Candidate Detail Title')).closest('article')!;
    expect(within(card).getByRole('button', { name: 'v90002' })).toHaveAttribute('title', expect.stringContaining('Alt Two'));
    await user.click(within(card).getByRole('button', { name: 'v90002' }));
    await waitFor(() => expect(screen.getAllByText('The AliceNet link for this item could not be changed.').length).toBeGreaterThan(0));
  });

  it('shows an error toast when the initial load fails', async () => {
    global.fetch = vi.fn(async () => json({ error: 'load failed' }, 500));
    renderClient();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('AliceNet stock could not be loaded. Retry or check the server.');
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

  it('renders the no-stock empty state without a last-fetch label', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ last_fetch: null })));
    renderClient();
    expect(await screen.findByText('No stock downloaded yet. Click "Download" to fetch the latest AliceNet inventory.')).toBeInTheDocument();
    expect(screen.queryByText(/Updated:/)).toBeNull();
  });

  it('falls back to raw price text and hides empty prices', async () => {
    const rawPrice = makeItem({ code: '001-000018-001', title: 'Raw Price Title', sale_price: 'Ask at counter' });
    const noPrice = makeItem({ code: '001-000019-001', title: 'No Price Title', sale_price: null, list_price: null });
    global.fetch = vi.fn(async () => json(snapshot({ items: [rawPrice, noPrice], stats: { total: 2 } })));
    renderClient();
    expect(await screen.findByText('Raw Price Title')).toBeInTheDocument();
    expect(screen.getByText('Ask at counter')).toBeInTheDocument();
    expect(screen.getByText('No Price Title')).toBeInTheDocument();
  });

  it('renders no candidate chip row for an empty candidate payload', async () => {
    const item = makeItem({
      code: '001-000020-001',
      title: 'Empty Candidate Title',
      vn_id: 'v90020',
      vn_match_source: 'auto',
      vn_candidates: '[]',
    });
    global.fetch = vi.fn(async () => json(snapshot({ items: [item], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    const card = (await screen.findByText('Empty Candidate Title')).closest('article')!;
    expect(within(card).queryByText('Candidates:')).toBeNull();
  });

  it('restores non-string saved preferences and malformed saved preferences as defaults', async () => {
    window.localStorage.setItem('vncoll.alicenet.prefs.v1', JSON.stringify({ sort: 1, group: false, view: null }));
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    const first = renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toHaveValue('match_status');
    first.unmount();

    window.localStorage.setItem('vncoll.alicenet.prefs.v1', '{');
    renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveClass('bg-accent');
  });

  it('falls back to default preferences when localStorage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    expect(await screen.findByText('Matched Title Two')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toHaveValue('match_status');
  });

  it('cleans default URL state from the shop route', async () => {
    mockedSearchParams = new URLSearchParams('filter=all&sort=match_status&group=none&view=cards&q=&producer=&yearMin=&yearMax=&priceMin=&priceMax=&filters=0');
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    await screen.findByText('Matched Title Two');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/places', { scroll: false }));
  });

  it('reports malformed initial and next-page stock payloads', async () => {
    global.fetch = vi.fn(async () => json({ broken: true }));
    const first = renderClient();
    expect(await screen.findByRole('alert')).toHaveTextContent('The local AliceNet response is malformed.');
    first.unmount();

    const page1 = {
      ...snapshot({ items: [VNDB_ITEM], stats: { total: 2, matched: 1, vndb_matched: 1 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('offset=96')) return json({ broken: true });
      return json(page1);
    });
    const { user } = renderClient();
    await screen.findByText('Matched Title Two');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The local AliceNet response is malformed.');
  });

  it('toggles filters, returns from list view to cards, and exits select mode', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    await screen.findByText('Matched Title Two');
    expect(screen.queryByLabelText('Producer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await waitFor(() => expect(screen.getByLabelText('Producer')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await waitFor(() => expect(screen.queryByLabelText('Producer')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent'));
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cards' })).toHaveClass('bg-accent'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit selection' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false'));
  });

  it('persists the filter panel state and restores it on the next mount', async () => {
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    const first = renderClient();
    await screen.findByText('Matched Title Two');
    expect(screen.queryByLabelText('Producer')).toBeNull();
    await first.user.click(screen.getByRole('button', { name: 'Filters' }));
    await waitFor(() => expect(window.localStorage.getItem('vncoll.alicenet.prefs.v1')).toContain('"showFilters":true'));
    first.unmount();

    renderClient();
    expect(await screen.findByLabelText('Producer')).toBeInTheDocument();
  });

  it('opens filters when an advanced URL filter is active', async () => {
    mockedSearchParams = new URLSearchParams('priceMin=2000&filters=0');
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    expect(await screen.findByLabelText('Min price')).toHaveValue('2000');
  });

  it('honors an explicitly open filter panel URL over saved preferences', async () => {
    window.localStorage.setItem('vncoll.alicenet.prefs.v1', JSON.stringify({ showFilters: false }));
    mockedSearchParams = new URLSearchParams('filters=1');
    global.fetch = vi.fn(async () => json(snapshot({ items: [VNDB_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    expect(await screen.findByLabelText('Producer')).toBeInTheDocument();
  });

  it('measures and window-renders large card lists deterministically', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 900, 1200));
    const many = Array.from({ length: 120 }, (_, index) =>
      makeItem({
        code: `001-${String(index + 100).padStart(6, '0')}-001`,
        title: `Measured Card ${index + 1}`,
      }),
    );
    global.fetch = vi.fn(async () => json(snapshot({ items: many, stats: { total: many.length } })));
    renderClient();
    expect(await screen.findByText(/120 items - virtual scroll active/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-virtualized-alicenet-grid="true"]')).not.toBeNull());
  });

  it('window-renders large list view rows and keeps row actions usable', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 900, 1200));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1000 });
    const many = Array.from({ length: 120 }, (_, index) =>
      makeItem({
        code: `001-${String(index + 200).padStart(6, '0')}-001`,
        title: `Measured Row ${index + 1}`,
        egs_id: index === 10 ? 80010 : null,
        egs_match_source: index === 10 ? 'auto' : null,
      }),
    );
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json(snapshot({ items: many, stats: { total: many.length, matched: 1, egs_only: 1 } }));
    });
    renderClient();
    await screen.findByText(/120 items - virtual scroll active/);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent'));
    const [renderedTitle] = await screen.findAllByText(/^Measured Row \d+$/);
    expect(renderedTitle).toBeDefined();
    const renderedName = renderedTitle.textContent ?? '';
    expect(screen.getAllByText(/^Measured Row \d+$/).length).toBeLessThan(120);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const row = renderedTitle.closest('li')!;
    const rowToggle = within(row).getByRole('button', { name: `Select ${renderedName}` });
    fireEvent.click(rowToggle);
    await waitFor(() => expect(rowToggle).toHaveAttribute('aria-pressed', 'true'));
    expect(within(row).getByRole('button', { name: 'Link' })).toBeEnabled();
  });
});
