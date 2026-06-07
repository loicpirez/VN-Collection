// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AliceNetClient } from '@/components/AliceNetClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { AliceNetClientItem, AliceNetClientStats } from '@/lib/alicenet-client-shape';
import { VIRTUAL_GRID_THRESHOLD } from '@/lib/virtual-grid';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/stock',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeItem(overrides: Partial<AliceNetClientItem> = {}): AliceNetClientItem {
  return {
    code: '001-000001-001', title: 'Stock Title One', jan: null, release_date: '2018/05/25',
    list_price: '¥8,800', sale_price: '¥4,270', vn_id: null, vn_match_source: null, vn_candidates: null,
    search_title: null, egs_id: null, egs_match_source: null, egs_title: null, egs_brand: null,
    egs_release_date: null, egs_image_url: null, egs_vndb_raw: null, in_collection: 0, in_wishlist: 0,
    last_matched_at: null, fetched_at: 1700000000, updated_at: 1700000000, vn_image_url: null,
    vn_local_image: null, vn_image_sexual: null, vn_developers: null,
    ...overrides,
  };
}

function makeStats(overrides: Partial<AliceNetClientStats> = {}): AliceNetClientStats {
  return {
    total: 0, matched: 0, vndb_matched: 0, egs_only: 0, unmatched: 0, unprocessed: 0,
    none_found: 0, in_collection: 0, in_wishlist: 0,
    ...overrides,
  };
}

function snapshot(opts: {
  items?: AliceNetClientItem[];
  stats?: Partial<AliceNetClientStats>;
  pending?: { vndb_pending: number; egs_pending: number };
} = {}) {
  const items = opts.items ?? [];
  return {
    items,
    stats: makeStats({ total: items.length, ...opts.stats }),
    pending: opts.pending ?? { vndb_pending: 0, egs_pending: 0 },
    last_fetch: 1700000000,
  };
}

function renderClient() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <AliceNetClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

function AliceNetUnmountHarness() {
  const [mounted, setMounted] = useState(true);
  return (
    <DisplaySettingsProvider>
      <button type="button" onClick={() => setMounted(false)}>Unmount AliceNet</button>
      {mounted && <AliceNetClient />}
    </DisplaySettingsProvider>
  );
}

function renderUnmountHarness() {
  return renderWithProviders(<AliceNetUnmountHarness />, { locale: 'en' });
}

function tabsGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'All' });
}

const COLLECTION_ITEM = makeItem({
  code: '001-000002-001', title: 'Collection Title', vn_id: 'v90001', vn_match_source: 'auto',
  vn_developers: JSON.stringify([{ id: 'p90001', name: 'Studio X' }]), in_collection: 1, sale_price: '¥1,000', release_date: '2019/01/01',
});
const WISHLIST_ITEM = makeItem({
  code: '001-000003-001', title: 'Wishlist Title', egs_id: 55555, egs_match_source: 'auto',
  egs_brand: 'Brand Z', in_wishlist: 1, sale_price: '¥9,000', release_date: '2010/06/06',
});

function mixedMetadataItems(): AliceNetClientItem[] {
  return [
    COLLECTION_ITEM,
    WISHLIST_ITEM,
    makeItem({
      code: '001-000004-001',
      title: 'Fallback Date Title',
      release_date: null,
      egs_release_date: '2022/04/01',
      sale_price: null,
      egs_brand: 'Brand Only',
      egs_id: 70004,
      egs_match_source: 'auto',
    }),
    makeItem({
      code: '001-000005-001',
      title: 'Malformed Year Title',
      release_date: 'release pending',
      sale_price: 'price pending',
      vn_developers: JSON.stringify([{ id: '', name: 'Ignored' }, { id: 'p-empty-name', name: '' }]),
    }),
  ];
}

function manyItems(count = VIRTUAL_GRID_THRESHOLD + 24): AliceNetClientItem[] {
  return Array.from({ length: count }, (_, index) => makeItem({
    code: `001-${String(index + 1).padStart(6, '0')}-001`,
    title: `Bulk Stock ${String(index + 1).padStart(3, '0')}`,
    sale_price: `¥${(index + 1) * 100}`,
    release_date: `20${String(index % 20).padStart(2, '0')}/01/01`,
  }));
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

async function renderMixedMetadataClient(): Promise<void> {
  global.fetch = vi.fn(async () =>
    json(snapshot({ items: mixedMetadataItems(), stats: { total: 4, matched: 3, vndb_matched: 1, egs_only: 2, unmatched: 1 } })),
  );
  renderClient();
  await screen.findByText('Fallback Date Title');
}

beforeEach(() => {
  replace.mockClear();
  try { window.localStorage.clear(); } catch { /* ignore */ }
  global.fetch = vi.fn(async () => json(snapshot()));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AliceNetClient branches', () => {
  it('filters by the in-collection tab', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [COLLECTION_ITEM, WISHLIST_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1, in_collection: 1, in_wishlist: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(within(tabsGroup()).getByRole('button', { name: /In collection/ }));
    await waitFor(() => expect(screen.queryByText('Wishlist Title')).toBeNull());
    expect(screen.getByText('Collection Title')).toBeInTheDocument();
  });

  it('filters by the in-wishlist tab', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [COLLECTION_ITEM, WISHLIST_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1, in_collection: 1, in_wishlist: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Wishlist Title');
    await user.click(within(tabsGroup()).getByRole('button', { name: /In wishlist/ }));
    await waitFor(() => expect(screen.queryByText('Collection Title')).toBeNull());
    expect(screen.getByText('Wishlist Title')).toBeInTheDocument();
  });

  it('cycles through the remaining sort keys without throwing', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [COLLECTION_ITEM, WISHLIST_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const sort = screen.getByLabelText('Sort');
    for (const value of ['release_desc', 'release_asc', 'price_asc', 'updated_desc', 'match_status']) {
      await user.selectOptions(sort, value);
    }
    expect(screen.getByText('Collection Title')).toBeInTheDocument();
    expect(screen.getByText('Wishlist Title')).toBeInTheDocument();
  });

  it('groups by producer and by year', async () => {
    global.fetch = vi.fn(async () =>
      json(snapshot({ items: [COLLECTION_ITEM, WISHLIST_ITEM], stats: { matched: 2, vndb_matched: 1, egs_only: 1 } })),
    );
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const group = screen.getByLabelText('Group');
    await user.selectOptions(group, 'producer');
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0));
    await user.selectOptions(group, 'year');
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0));
  });

  it('groups unresolved and unknown AliceNet rows under readable fallback headings', async () => {
    const unknown = makeItem({
      code: '001-000020-001',
      title: 'Unknown Group Title',
      release_date: null,
      egs_release_date: null,
      vn_developers: null,
      egs_brand: null,
    });
    const unresolved = makeItem({
      code: '001-000021-001',
      title: 'Unresolved Group Title',
      vn_match_source: 'none',
    });
    global.fetch = vi.fn(async () => json(snapshot({
      items: [COLLECTION_ITEM, WISHLIST_ITEM, unknown, unresolved],
      stats: { total: 4, matched: 2, vndb_matched: 1, egs_only: 1, unmatched: 2, none_found: 1 },
    })));
    const { user } = renderClient();
    await screen.findByText('Unknown Group Title');
    const group = screen.getByLabelText('Group');
    await user.selectOptions(group, 'match');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Needs match' })).toBeInTheDocument());
    await user.selectOptions(group, 'producer');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Unknown' })).toBeInTheDocument());
    await user.selectOptions(group, 'year');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Unknown' })).toBeInTheDocument());
  });

  it('keeps the dialog closed and does not DELETE when clear is cancelled', async () => {
    let deleteHit = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        deleteHit = true;
        return json({ ok: true });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { matched: 1, vndb_matched: 1, in_collection: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Collection Title')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Clear' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteHit).toBe(false);
  });

  it('toasts when clearing a link fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') return json({ error: 'clear boom' }, 500);
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { matched: 1, vndb_matched: 1, in_collection: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Collection Title')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Clear' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getAllByText(/clear boom/).length).toBeGreaterThan(0));
  });

  it('covers advanced sort fallbacks for mixed AliceNet metadata', async () => {
    await renderMixedMetadataClient();
    const sort = screen.getByLabelText('Sort');
    fireEvent.change(sort, { target: { value: 'price_asc' } });
    fireEvent.change(sort, { target: { value: 'price_desc' } });
    fireEvent.change(sort, { target: { value: 'release_desc' } });
    fireEvent.change(sort, { target: { value: 'release_asc' } });
    fireEvent.change(sort, { target: { value: 'updated_desc' } });
    expect(screen.getByText('Fallback Date Title')).toBeInTheDocument();
  });

  it('filters mixed AliceNet metadata by EGS producer and EGS id text', async () => {
    await renderMixedMetadataClient();
    let producerFilter = screen.queryByRole('combobox', { name: 'Producer' });
    if (!producerFilter) {
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      producerFilter = await screen.findByRole('combobox', { name: 'Producer' });
    }
    fireEvent.change(producerFilter, { target: { value: 'egs:Brand Only' } });
    await waitFor(() => expect(screen.queryByText('Collection Title')).toBeNull());
    expect(screen.getByText('Fallback Date Title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    fireEvent.change(screen.getByLabelText('Filter by title, code...'), { target: { value: '70004' } });
    await waitFor(() => expect(screen.queryByText('Wishlist Title')).toBeNull());
    expect(screen.getByText('Fallback Date Title')).toBeInTheDocument();
  });

  it('filters mixed AliceNet metadata by fallback year and numeric price', async () => {
    await renderMixedMetadataClient();
    if (!screen.queryByLabelText('Min year')) {
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      await screen.findByLabelText('Min year');
    }
    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2020' } });
    await waitFor(() => expect(screen.queryByText('Malformed Year Title')).toBeNull());
    expect(screen.getByText('Fallback Date Title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    fireEvent.change(screen.getByLabelText('Min price'), { target: { value: '5000' } });
    await waitFor(() => expect(screen.queryByText('Fallback Date Title')).toBeNull());
    expect(screen.getByText('Wishlist Title')).toBeInTheDocument();
  });

  it('filters out rows with no release date when a year range is active', async () => {
    const noDate = makeItem({
      code: '001-000022-001',
      title: 'No Date Title',
      release_date: null,
      egs_release_date: null,
    });
    const egsDate = makeItem({
      code: '001-000023-001',
      title: 'EGS Date Title',
      release_date: null,
      egs_release_date: '2022/02/22',
      egs_id: 9222,
      egs_match_source: 'auto',
    });
    global.fetch = vi.fn(async () => json(snapshot({
      items: [noDate, egsDate],
      stats: { total: 2, matched: 1, egs_only: 1, unmatched: 1 },
    })));
    renderClient();
    await screen.findByText('No Date Title');
    if (!screen.queryByLabelText('Min year')) {
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      await screen.findByLabelText('Min year');
    }
    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2020' } });
    await waitFor(() => expect(screen.queryByText('No Date Title')).toBeNull());
    expect(screen.getByText('EGS Date Title')).toBeInTheDocument();
  });

  it('applies producer chips for VNDB developers and tolerates blank developer ids', async () => {
    const blankId = makeItem({
      code: '001-000024-001',
      title: 'Blank Producer Title',
      vn_developers: JSON.stringify([{ id: '', name: 'Blank Producer' }]),
    });
    global.fetch = vi.fn(async () => json(snapshot({
      items: [COLLECTION_ITEM, blankId],
      stats: { total: 2, matched: 1, vndb_matched: 1, unmatched: 1 },
    })));
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Studio X' }));
    await waitFor(() => expect(screen.queryByText('Blank Producer Title')).toBeNull());
    expect(screen.getByText('Collection Title')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await screen.findByText('Blank Producer Title');
    await user.click(screen.getByRole('button', { name: 'Blank Producer' }));
    expect(screen.getByText('Blank Producer Title')).toBeInTheDocument();
  });

  it('does not open the bulk clear confirmation when selected rows have no VN link', async () => {
    const unmatched = makeItem({ code: '001-000006-001', title: 'Unlinked Bulk Title' });
    global.fetch = vi.fn(async () => json(snapshot({ items: [unmatched], stats: { total: 1, unmatched: 1 } })));
    const { user } = renderClient();
    await screen.findByText('Unlinked Bulk Title');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('cancels bulk clear without deleting selected VN links', async () => {
    let deleteCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/link') && init?.method === 'DELETE') {
        deleteCalls += 1;
        return json({ ok: true });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select VNDB-linked' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteCalls).toBe(0);
  });

  it('reports bulk clear failures and reloads the stock list', async () => {
    let reloads = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') return json({ error: 'bulk clear boom' }, 500);
      reloads += 1;
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select VNDB-linked' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getAllByText(/bulk clear boom/).length).toBeGreaterThan(0));
    expect(reloads).toBeGreaterThan(1);
  });

  it('ignores reset and clear confirmation results after AliceNet unmounts', async () => {
    global.fetch = vi.fn(async () => json(snapshot({
      items: [COLLECTION_ITEM],
      stats: { total: 1, matched: 1, vndb_matched: 1 },
    })));
    const { user } = renderUnmountHarness();
    await screen.findByText('Collection Title');

    await user.click(screen.getByRole('button', { name: 'Reset auto-matches' }));
    let confirm = await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Unmount AliceNet' }));
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    cleanup();
    global.fetch = vi.fn(async () => json(snapshot({
      items: [COLLECTION_ITEM],
      stats: { total: 1, matched: 1, vndb_matched: 1 },
    })));
    const second = renderUnmountHarness();
    await screen.findByText('Collection Title');
    const card = screen.getByText('Collection Title').closest('article')!;
    await second.user.click(within(card).getByRole('button', { name: 'Clear' }));
    confirm = await screen.findByRole('alertdialog');
    await second.user.click(screen.getByRole('button', { name: 'Unmount AliceNet' }));
    await second.user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('stops an in-flight bulk clear through the visible stop button', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select VNDB-linked' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.getAllByText(/Stopped/).length).toBeGreaterThan(0));
  });

  it('aborts a pending candidate remap request on unmount', async () => {
    const remapItem = makeItem({
      code: '001-000007-001',
      title: 'Remap Pending Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Current candidate', alttitle: null, released: '2020-01-01' },
        { id: 'v90002', title: 'Next candidate', alttitle: null, released: '2020-02-02' },
        { id: 'v90003', title: 'Third candidate', alttitle: null, released: '2020-03-03' },
      ]),
    });
    let postCalls = 0;
    let aborts = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborts += 1;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      return json(snapshot({ items: [remapItem], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const view = renderClient();
    const card = (await screen.findByText('Remap Pending Title')).closest('article')!;
    const next = within(card).getByRole('button', { name: 'v90002' });
    act(() => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(postCalls).toBe(1);
    view.unmount();
    expect(aborts).toBeGreaterThanOrEqual(1);
  });

  it('ignores duplicate candidate remap clicks while one request is pending', async () => {
    const remapItem = makeItem({
      code: '001-000018-001',
      title: 'Remap Duplicate Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Current candidate', alttitle: null, released: '2020-01-01' },
        { id: 'v90002', title: 'Next candidate', alttitle: null, released: '2020-02-02' },
      ]),
    });
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(json(snapshot({ items: [remapItem], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    const card = (await screen.findByText('Remap Duplicate Title')).closest('article')!;
    const next = within(card).getByRole('button', { name: 'v90002' });
    act(() => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(postCalls).toBe(1);
    view.unmount();
  });

  it('ignores a candidate remap response that resolves after unmount', async () => {
    const remapItem = makeItem({
      code: '001-000017-001',
      title: 'Remap Stale Success Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Current candidate', alttitle: null, released: '2020-01-01' },
        { id: 'v90002', title: 'Next candidate', alttitle: null, released: '2020-02-02' },
      ]),
    });
    const remapRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') return remapRequest.promise;
      return Promise.resolve(json(snapshot({ items: [remapItem], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    const card = (await screen.findByText('Remap Stale Success Title')).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'v90002' }));
    view.unmount();
    await act(async () => {
      remapRequest.resolve(json({ ok: true }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Remap Stale Success Title')).toBeNull();
  });

  it('ignores an initial AliceNet load response that resolves after unmount', async () => {
    const loadRequest = deferredResponse();
    const fetchMock = vi.fn(() => loadRequest.promise);
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderClient();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/alicenet', expect.objectContaining({ cache: 'no-store' })));
    view.unmount();
    await act(async () => {
      loadRequest.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Collection Title')).toBeNull();
  });

  it('reports an HTTP error from a follow-up AliceNet page', async () => {
    const pageOne = {
      ...snapshot({ items: [makeItem({ title: 'First Follow Page Title' })], stats: { total: 2 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('offset=1')) return Promise.resolve(json({ error: 'follow page failed' }, 500));
      return Promise.resolve(json(pageOne));
    }) as unknown as typeof fetch;
    renderClient();
    await waitFor(() => expect(screen.getAllByText(/follow page failed/).length).toBeGreaterThan(0));
  });

  it('ignores a follow-up AliceNet page that resolves after unmount', async () => {
    const pageOne = {
      ...snapshot({ items: [makeItem({ title: 'Paged Stale Title' })], stats: { total: 2 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    const pageTwo = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('offset=1')) return pageTwo.promise;
      return Promise.resolve(json(pageOne));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderClient();
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('offset=1'))).toBe(true));
    view.unmount();
    await act(async () => {
      pageTwo.resolve(json({
        items: [makeItem({ code: '001-000018-001', title: 'Second Follow Page Title' })],
        page: { offset: 1, limit: 1, total: 2, has_more: false },
      }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Second Follow Page Title')).toBeNull();
  });

  it('ignores an AbortError from the initial AliceNet load', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(() => Promise.reject(abortError)) as unknown as typeof fetch;
    renderClient();
    await act(flushAsyncWork);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a sync-stock response that resolves after Stop', async () => {
    const syncRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/alicenet/fetch')).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('1 processed, 0 matched.')).toBeNull();
  });

  it('ignores a match-loop response that resolves after Stop', async () => {
    const matchRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') return matchRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1 },
      })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: /Match new rows/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/alicenet/match-next')).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      matchRequest.resolve(json({ processed: 1, matched: 1, remaining: 0 }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('1 processed, 1 matched.')).toBeNull();
  });

  it('does not continue the download-all pipeline after Stop', async () => {
    const syncRequest = deferredResponse();
    const postCalls: string[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1, none_found: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(postCalls).toContain('/api/alicenet/fetch'));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
    expect(postCalls).toEqual(['/api/alicenet/fetch']);
  });

  it('ignores reset-auto-match completion after unmount', async () => {
    const resetRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/reset-matches' && init?.method === 'POST') return resetRequest.promise;
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Collection Title');
    fireEvent.click(screen.getByRole('button', { name: 'Reset auto-matches' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/alicenet/reset-matches')).toBe(true));
    view.unmount();
    await act(async () => {
      resetRequest.resolve(json({ cleared: 1 }));
      await flushAsyncWork();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('ignores reset-auto-match AbortError after unmount', async () => {
    let resetStarted = false;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/reset-matches' && init?.method === 'POST') {
        resetStarted = true;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Collection Title');
    fireEvent.click(screen.getByRole('button', { name: 'Reset auto-matches' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(resetStarted).toBe(true));
    view.unmount();
    await act(flushAsyncWork);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('ignores clear-link completion after unmount', async () => {
    const clearRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') return clearRequest.promise;
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderClient();
    const card = (await screen.findByText('Collection Title')).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Clear' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/link') && c[1]?.method === 'DELETE')).toBe(true));
    view.unmount();
    await act(async () => {
      clearRequest.resolve(json({ ok: true }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Collection Title')).toBeNull();
  });

  it('ignores clear-link AbortError after unmount', async () => {
    let clearStarted = false;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        clearStarted = true;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    const card = (await screen.findByText('Collection Title')).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Clear' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(clearStarted).toBe(true));
    view.unmount();
    await act(flushAsyncWork);
    expect(screen.queryByText('Collection Title')).toBeNull();
  });

  it.each([
    { name: 'recover no-result rows', button: /Recover no-result rows/, endpoint: '/api/alicenet/match-next' },
    { name: 'smart VNDB retry', button: /Smart VNDB retry/, endpoint: '/api/alicenet/retry-vndb-aggressive' },
    { name: 'VNDB from EGS', tab: /EGS only/, button: /VNDB from EGS/, endpoint: '/api/alicenet/match-vndb-from-egs' },
    { name: 'search EGS', tab: /No VNDB result/, button: /^Search on EGS$/, endpoint: '/api/alicenet/search-egs-no-vndb' },
    { name: 'search EGS aggressive', tab: /No VNDB result/, button: /Search on EGS \(aggressive filter\)/, endpoint: '/api/alicenet/search-egs-no-vndb' },
    { name: 'download VNDB data', button: /Download VNDB data/, endpoint: '/api/alicenet/download-vndb' },
    { name: 'resolve EGS', button: /Resolve EGS via VNDB/, endpoint: '/api/alicenet/resolve-egs' },
  ])('runs the AliceNet $name action branch', async (action) => {
    const item = makeItem({
      code: '001-000008-001',
      title: 'Action Branch Title',
      vn_id: 'v90008',
      vn_match_source: 'auto',
      egs_id: 90008,
      egs_match_source: 'auto',
    });
    let hit = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === action.endpoint && init?.method === 'POST') {
        hit = true;
        return json({ processed: 0, matched: 0, remaining: 0 });
      }
      return json(snapshot({
        items: [item],
        stats: { total: 1, matched: 1, vndb_matched: 1, egs_only: 1, none_found: 1, unprocessed: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      }));
    });
    renderClient();
    await screen.findByText('Action Branch Title');
    if (action.tab) {
      fireEvent.click(within(tabsGroup()).getByRole('button', { name: action.tab }));
    }
    const buttons = screen.getAllByRole('button', { name: action.button });
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(hit).toBe(true));
    await waitFor(() => expect(screen.getByText('0 processed, 0 matched.')).toBeInTheDocument());
  });

  it('ignores duplicate single-operation and download-all clicks while the first request is active', async () => {
    let syncCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        syncCalls += 1;
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const first = renderClient();
    await screen.findByText('Collection Title');
    const syncButton = screen.getByRole('button', { name: 'Sync stock' });
    fireEvent.click(syncButton);
    fireEvent.click(syncButton);
    await waitFor(() => expect(syncCalls).toBe(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    first.unmount();
    cleanup();

    let downloadAllCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        downloadAllCalls += 1;
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const second = renderClient();
    await screen.findByText('Collection Title');
    const downloadAll = screen.getByRole('button', { name: 'Download all' });
    fireEvent.click(downloadAll);
    fireEvent.click(downloadAll);
    await waitFor(() => expect(downloadAllCalls).toBe(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    second.unmount();
  });

  it('shows a specific malformed snapshot error instead of a generic loading failure', async () => {
    global.fetch = vi.fn(async () => json({ items: 'not-an-array' }));
    renderClient();
    await waitFor(() =>
      expect(screen.getAllByText(/The local AliceNet response is malformed/).length).toBeGreaterThan(0),
    );
  });

  it('falls back to the common error label for non-Error load failures', async () => {
    global.fetch = vi.fn(() => Promise.reject('raw load failure')) as unknown as typeof fetch;
    renderClient();
    await waitFor(() => expect(screen.getAllByText('Error').length).toBeGreaterThan(0));
  });

  it('shows a malformed follow-up page error when pagination returns an invalid shape', async () => {
    const pageOne = {
      ...snapshot({ items: [makeItem({ title: 'Paged First Title' })], stats: { total: 2 } }),
      page: { offset: 0, limit: 1, total: 2, has_more: true },
    };
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('offset=1')) return json({ items: 'bad page' });
      return json(pageOne);
    });
    renderClient();
    await waitFor(() =>
      expect(screen.getAllByText(/The local AliceNet response is malformed/).length).toBeGreaterThan(0),
    );
  });

  it('falls back to default AliceNet preferences when local storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    global.fetch = vi.fn(async () => json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    renderClient();
    expect(await screen.findByText('Collection Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toHaveValue('match_status');
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveClass('bg-accent');
  });

  it('reports candidate remap failures with the upstream message', async () => {
    const remapItem = makeItem({
      code: '001-000009-001',
      title: 'Remap Error Title',
      vn_id: 'v90001',
      vn_match_source: 'auto',
      vn_candidates: JSON.stringify([
        { id: 'v90001', title: 'Current candidate', alttitle: null, released: '2020-01-01' },
        { id: 'v90002', title: 'Next candidate', alttitle: null, released: '2020-02-02' },
      ]),
    });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'POST') return json({ error: 'candidate boom' }, 500);
      return json(snapshot({ items: [remapItem], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Remap Error Title')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'v90002' }));
    await waitFor(() => expect(screen.getAllByText(/candidate boom/).length).toBeGreaterThan(0));
  });

  it('shows removed-stock progress when AliceNet sync deletes sold rows', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        return json({ count: 1, added: 0, updated: 1, removed: 2, fetched_at: 1700000001 });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(screen.getAllByText('2 item(s) removed from stock.').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText('1 processed, 0 matched.')).toBeInTheDocument());
  });

  it('completes AliceNet sync without a removed-stock toast when no sold rows disappear', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        return json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000001 });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(screen.getByText('1 processed, 0 matched.')).toBeInTheDocument());
    expect(screen.queryByText(/item\(s\) removed from stock/)).toBeNull();
  });

  it('reports malformed stock-sync progress from the AliceNet sync route', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return json({ count: 'bad' });
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() =>
      expect(screen.getAllByText(/AliceNet sync returned a malformed response/).length).toBeGreaterThan(0),
    );
  });

  it('reports HTTP errors from the AliceNet sync route', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return json({ error: 'sync HTTP boom' }, 502);
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Sync stock' }));
    await waitFor(() => expect(screen.getAllByText(/sync HTTP boom/).length).toBeGreaterThan(0));
  });

  it('reports malformed loop progress from AliceNet processing routes', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') return json({ processed: 'bad', remaining: 1 });
      return json(snapshot({
        items: [makeItem({ title: 'Needs Match Title' })],
        stats: { total: 1, unmatched: 1, unprocessed: 1 },
      }));
    });
    const { user } = renderClient();
    await screen.findByText('Needs Match Title');
    await user.click(screen.getByRole('button', { name: /Match new rows/ }));
    await waitFor(() =>
      expect(screen.getAllByText(/AliceNet processing returned malformed progress/).length).toBeGreaterThan(0),
    );
  });

  it('uses the virtualized card grid for large AliceNet stock lists', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1200,
      height: 3000,
      top: 0,
      right: 1200,
      bottom: 3000,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(), stats: { total: VIRTUAL_GRID_THRESHOLD + 24, unmatched: VIRTUAL_GRID_THRESHOLD + 24 } })));
    const { container } = renderClient();
    expect(await screen.findByText('Bulk Stock 001')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('[data-virtualized-alicenet-grid="true"]')).not.toBeNull());
    expect(screen.getByText(/virtual scroll active/)).toBeInTheDocument();
    rectSpy.mockRestore();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it('uses the virtualized list view for large AliceNet stock lists', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1200,
      height: 4000,
      top: 0,
      right: 1200,
      bottom: 4000,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(), stats: { total: VIRTUAL_GRID_THRESHOLD + 24, unmatched: VIRTUAL_GRID_THRESHOLD + 24 } })));
    const { user } = renderClient();
    await screen.findByText('Bulk Stock 001');
    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(screen.queryByText('Bulk Stock 120')).toBeNull());
    expect(screen.getByText('Bulk Stock 001')).toBeInTheDocument();
  });

  it('coalesces and cancels pending virtual card-grid measurements', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(), stats: { total: VIRTUAL_GRID_THRESHOLD + 24, unmatched: VIRTUAL_GRID_THRESHOLD + 24 } })));
    const view = renderClient();
    await screen.findByText('Bulk Stock 001');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    view.unmount();
    expect(cancelSpy).toHaveBeenCalled();
    act(() => {
      for (const frame of frames) frame(0);
    });
    expect(screen.queryByText('Bulk Stock 001')).toBeNull();
  });

  it('renders card-grid top spacers and reuses equal virtual measurements', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: -3200,
      width: 1200,
      height: 6000,
      top: -3200,
      right: 1200,
      bottom: 2800,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(180), stats: { total: 180, unmatched: 180 } })));
    const { container, unmount } = renderClient();
    await screen.findByText('Bulk Stock 001');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      frames.splice(0).forEach((frame) => frame(0));
    });
    await waitFor(() => expect(container.querySelector('[data-virtualized-alicenet-grid="true"] [aria-hidden="true"]')).not.toBeNull());
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      frames.splice(0).forEach((frame) => frame(0));
    });
    unmount();
  });

  it('coalesces and cancels pending virtual row-list measurements', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(), stats: { total: VIRTUAL_GRID_THRESHOLD + 24, unmatched: VIRTUAL_GRID_THRESHOLD + 24 } })));
    const { user, unmount } = renderClient();
    await screen.findByText('Bulk Stock 001');
    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    act(() => {
      for (const frame of frames) frame(0);
    });
    expect(screen.queryByText('Bulk Stock 001')).toBeNull();
  });

  it('renders row-list top spacers without ResizeObserver and reuses equal ranges', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: -1200,
      width: 1200,
      height: 6000,
      top: -1200,
      right: 1200,
      bottom: 4800,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    vi.stubGlobal('ResizeObserver', undefined);
    global.fetch = vi.fn(async () => json(snapshot({ items: manyItems(180), stats: { total: 180, unmatched: 180 } })));
    const { container, unmount } = renderClient();
    await screen.findByText('Bulk Stock 001');
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      frames.splice(0).forEach((frame) => frame(0));
    });
    await waitFor(() => expect(container.querySelector('ul > li[aria-hidden="true"]')).not.toBeNull());
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => {
      frames.splice(0).forEach((frame) => frame(0));
    });
    unmount();
  });

  it('does not schedule virtual measurements for small card and row lists', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    global.fetch = vi.fn(async () => json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await act(flushAsyncWork);
    await user.click(screen.getByRole('button', { name: 'List' }));
    await act(flushAsyncWork);
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('ignores duplicate operation clicks while the first request is in flight', async () => {
    const syncRequest = deferredResponse();
    const postCalls: string[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const sync = screen.getByRole('button', { name: 'Sync stock' });
    fireEvent.click(sync);
    fireEvent.click(sync);
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch']));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
  });

  it('ignores duplicate download-all clicks while the pipeline is already running', async () => {
    const syncRequest = deferredResponse();
    const postCalls: string[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1, none_found: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const downloadAll = screen.getByRole('button', { name: 'Download all' });
    fireEvent.click(downloadAll);
    fireEvent.click(downloadAll);
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch']));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
  });

  it('ignores a second operation started before the busy UI settles', async () => {
    const syncRequest = deferredResponse();
    const postCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const sync = screen.getByRole('button', { name: 'Sync stock' });
    const downloadAll = screen.getByRole('button', { name: 'Download all' });
    act(() => {
      fireEvent.click(sync);
      fireEvent.click(downloadAll);
    });
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch']));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
  });

  it('ignores a second single operation started during download-all startup', async () => {
    const syncRequest = deferredResponse();
    const postCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return syncRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    const downloadAll = screen.getByRole('button', { name: 'Download all' });
    const sync = screen.getByRole('button', { name: 'Sync stock' });
    act(() => {
      fireEvent.click(downloadAll);
      fireEvent.click(sync);
    });
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch']));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      syncRequest.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
  });

  it('does not write a last-run summary after unmounting during the post-operation reload', async () => {
    const reloadRequest = deferredResponse();
    let loadCount = 0;
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') {
        return Promise.resolve(json({ processed: 1, matched: 1, remaining: 0 }));
      }
      loadCount += 1;
      if (loadCount === 2) return reloadRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1 },
      })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Collection Title');
    fireEvent.click(screen.getByRole('button', { name: /Match new rows/ }));
    await waitFor(() => expect(loadCount).toBe(2));
    view.unmount();
    await act(async () => {
      reloadRequest.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1 },
      })));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Last run')).toBeNull();
  });

  it('stops download-all after the first match stage without starting later stages', async () => {
    const matchRequest = deferredResponse();
    const postCalls: string[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        return Promise.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      }
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') return matchRequest.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1, none_found: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      })));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch', '/api/alicenet/match-next']));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      matchRequest.resolve(json({ processed: 1, matched: 1, remaining: 0 }));
      await flushAsyncWork();
    });
    expect(postCalls).toEqual(['/api/alicenet/fetch', '/api/alicenet/match-next']);
  });

  it.each([
    {
      name: 'retry stage',
      target: 'retry',
      expected: ['/api/alicenet/fetch', '/api/alicenet/match-next', '/api/alicenet/match-next'],
    },
    {
      name: 'VNDB-from-EGS stage',
      target: 'vndb-from-egs',
      expected: ['/api/alicenet/fetch', '/api/alicenet/match-next', '/api/alicenet/match-next', '/api/alicenet/match-vndb-from-egs'],
    },
    {
      name: 'VNDB data stage',
      target: 'download-vndb',
      expected: ['/api/alicenet/fetch', '/api/alicenet/match-next', '/api/alicenet/match-next', '/api/alicenet/match-vndb-from-egs', '/api/alicenet/download-vndb'],
    },
    {
      name: 'EGS resolve stage',
      target: 'resolve-egs',
      expected: ['/api/alicenet/fetch', '/api/alicenet/match-next', '/api/alicenet/match-next', '/api/alicenet/match-vndb-from-egs', '/api/alicenet/download-vndb', '/api/alicenet/resolve-egs'],
    },
  ])('stops download-all after the $name', async ({ target, expected }) => {
    const pendingStage = deferredResponse();
    const postCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') {
        return Promise.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      }
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { retry_none?: boolean };
        if (target === 'retry' && body.retry_none === true) return pendingStage.promise;
        return Promise.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      }
      if (u === '/api/alicenet/match-vndb-from-egs' && init?.method === 'POST') {
        if (target === 'vndb-from-egs') return pendingStage.promise;
        return Promise.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      }
      if (u === '/api/alicenet/download-vndb' && init?.method === 'POST') {
        if (target === 'download-vndb') return pendingStage.promise;
        return Promise.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      }
      if (u === '/api/alicenet/resolve-egs' && init?.method === 'POST') {
        if (target === 'resolve-egs') return pendingStage.promise;
        return Promise.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      }
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 1, none_found: 1, egs_only: 1 },
        pending: { vndb_pending: 1, egs_pending: 1 },
      })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(postCalls).toEqual(expected));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      pendingStage.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      await flushAsyncWork();
    });
    expect(postCalls).toEqual(expected);
  });

  it('ignores duplicate reset, clear-link, and bulk-clear actions while confirmation is pending', async () => {
    let deletes = 0;
    let resets = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/alicenet/reset-matches' && init?.method === 'POST') {
        resets += 1;
        return json({ cleared: 1 });
      }
      if (u.includes('/link') && init?.method === 'DELETE') {
        deletes += 1;
        return json({ ok: true });
      }
      return json(snapshot({ items: [COLLECTION_ITEM], stats: { total: 1, matched: 1, vndb_matched: 1 } }));
    });
    const { user } = renderClient();
    const card = (await screen.findByText('Collection Title')).closest('article')!;

    const reset = screen.getByRole('button', { name: 'Reset auto-matches' });
    act(() => {
      fireEvent.click(reset);
      fireEvent.click(reset);
    });
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    const clear = within(card).getByRole('button', { name: 'Clear' });
    act(() => {
      fireEvent.click(clear);
      fireEvent.click(clear);
    });
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select VNDB-linked' }));
    const bulk = screen.getByRole('button', { name: 'Clear VN links' });
    act(() => {
      fireEvent.click(bulk);
      fireEvent.click(bulk);
    });
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(resets).toBe(0);
    expect(deletes).toBe(0);
  });

  it('pushes items into an existing group bucket when grouping by producer', async () => {
    const second = makeItem({
      code: '001-000019-001',
      title: 'Collection Sibling Title',
      vn_id: 'v90019',
      vn_match_source: 'auto',
      vn_developers: JSON.stringify([{ id: 'p90001', name: 'Studio X' }]),
    });
    global.fetch = vi.fn(async () => json(snapshot({
      items: [COLLECTION_ITEM, second],
      stats: { total: 2, matched: 2, vndb_matched: 2 },
    })));
    renderClient();
    await screen.findByText('Collection Title');
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'producer' } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Studio X' })).toBeInTheDocument());
    expect(screen.getByText('Collection Sibling Title')).toBeInTheDocument();
  });

  it('opens the link dialog from the list-row action', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json(snapshot({ items: [WISHLIST_ITEM], stats: { total: 1, matched: 1, egs_only: 1 } }));
    });
    const { user } = renderClient();
    await screen.findByText('Wishlist Title');
    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent'));
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders AliceNet secondary metadata in card and row layouts', async () => {
    const item = makeItem({
      code: '001-000029-001',
      title: 'Raw AliceNet Shop Name',
      egs_title: 'Canonical EGS Display Name',
      egs_id: 9029,
      egs_match_source: 'auto',
      egs_brand: 'Brand Z',
      egs_release_date: '2021/02/03',
      release_date: null,
      search_title: 'Normalized lookup name',
      in_collection: 1,
      in_wishlist: 1,
    });
    global.fetch = vi.fn(async () => json(snapshot({
      items: [item],
      stats: { total: 1, matched: 1, egs_only: 1, in_collection: 1, in_wishlist: 1 },
    })));
    const { user } = renderClient();
    expect(await screen.findByText('Canonical EGS Display Name')).toBeInTheDocument();
    expect(screen.getByText('Raw AliceNet Shop Name')).toBeInTheDocument();
    expect(screen.getByText('Searched as: Normalized lookup name')).toBeInTheDocument();
    expect(screen.getAllByText('In collection').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In wishlist').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Brand Z' }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List' })).toHaveClass('bg-accent'));
    expect(screen.getByText('Searched as: Normalized lookup name')).toBeInTheDocument();
  });

  it('shows indeterminate progress after download-all enters a zero-total loop stage', async () => {
    const fetchDone = deferredResponse();
    const matchPending = deferredResponse();
    const postCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') postCalls.push(u);
      if (u === '/api/alicenet/fetch' && init?.method === 'POST') return fetchDone.promise;
      if (u === '/api/alicenet/match-next' && init?.method === 'POST') return matchPending.promise;
      return Promise.resolve(json(snapshot({
        items: [COLLECTION_ITEM],
        stats: { total: 1, matched: 1, vndb_matched: 1, unprocessed: 0 },
      })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Collection Title');
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(postCalls).toContain('/api/alicenet/fetch'));
    await act(async () => {
      fetchDone.resolve(json({ count: 1, added: 0, updated: 1, removed: 0, fetched_at: 1700000002 }));
      await flushAsyncWork();
    });
    await waitFor(() => expect(postCalls).toEqual(['/api/alicenet/fetch', '/api/alicenet/match-next']));
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      matchPending.resolve(json({ processed: 0, matched: 0, remaining: 0 }));
      await flushAsyncWork();
    });
  });

  it('keeps bulk-clear current-item progress visible while a row delete is pending', async () => {
    const items = Array.from({ length: 2 }, (_, index) => makeItem({
      code: `001-${String(index + 40).padStart(6, '0')}-001`,
      title: `Progress Bulk ${index + 1}`,
      vn_id: `v90${index + 40}`,
      vn_match_source: 'auto',
    }));
    const firstDelete = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') return firstDelete.promise;
      return Promise.resolve(json(snapshot({ items, stats: { total: 2, matched: 2, vndb_matched: 2 } })));
    }) as unknown as typeof fetch;
    const { user } = renderClient();
    await screen.findByText('Progress Bulk 1');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Now: 001-000040-001')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await act(async () => {
      firstDelete.resolve(json({ ok: true }));
      await flushAsyncWork();
    });
  });

  it('ignores bulk-clear completion after unmount', async () => {
    const items = Array.from({ length: 2 }, (_, index) => makeItem({
      code: `001-${String(index + 60).padStart(6, '0')}-001`,
      title: `Unmount Bulk ${index + 1}`,
      vn_id: `v90${index + 60}`,
      vn_match_source: 'auto',
    }));
    const firstDelete = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') return firstDelete.promise;
      return Promise.resolve(json(snapshot({ items, stats: { total: 2, matched: 2, vndb_matched: 2 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Unmount Bulk 1');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Now: 001-000060-001');
    view.unmount();
    await act(async () => {
      firstDelete.resolve(json({ ok: true }));
      await flushAsyncWork();
    });
    expect(screen.queryByText('Unmount Bulk 1')).toBeNull();
  });

  it('ignores bulk-clear AbortError after unmount', async () => {
    const items = Array.from({ length: 2 }, (_, index) => makeItem({
      code: `001-${String(index + 70).padStart(6, '0')}-001`,
      title: `Abort Bulk ${index + 1}`,
      vn_id: `v90${index + 70}`,
      vn_match_source: 'auto',
    }));
    let deleteStarted = false;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        deleteStarted = true;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve(json(snapshot({ items, stats: { total: 2, matched: 2, vndb_matched: 2 } })));
    }) as unknown as typeof fetch;
    const view = renderClient();
    await screen.findByText('Abort Bulk 1');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(deleteStarted).toBe(true));
    view.unmount();
    await act(flushAsyncWork);
    expect(screen.queryByText('Abort Bulk 1')).toBeNull();
  });

  it('requires typing before bulk-clearing five or more linked rows', async () => {
    const items = Array.from({ length: 5 }, (_, index) => makeItem({
      code: `001-${String(index + 30).padStart(6, '0')}-001`,
      title: `Typed Bulk ${index + 1}`,
      vn_id: `v90${index + 30}`,
      vn_match_source: 'auto',
    }));
    const deletes: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/link') && init?.method === 'DELETE') {
        deletes.push(u);
        return json({ ok: true });
      }
      return json(snapshot({ items, stats: { total: 5, matched: 5, vndb_matched: 5 } }));
    });
    renderClient();
    await screen.findByText('Typed Bulk 1');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear VN links' }));
    const confirm = await screen.findByRole('alertdialog');
    const confirmButton = within(confirm).getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(within(confirm).getByRole('textbox'), { target: { value: 'DELETE' } });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    await waitFor(() => expect(deletes).toHaveLength(5));
  });
});
