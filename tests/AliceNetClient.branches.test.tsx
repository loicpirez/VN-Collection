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

function snapshot(opts: { items?: AliceNetClientItem[]; stats?: Partial<AliceNetClientStats> } = {}) {
  const items = opts.items ?? [];
  return {
    items,
    stats: makeStats({ total: items.length, ...opts.stats }),
    pending: { vndb_pending: 0, egs_pending: 0 },
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

beforeEach(() => {
  replace.mockClear();
  try { window.localStorage.clear(); } catch { /* ignore */ }
  global.fetch = vi.fn(async () => json(snapshot()));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    await user.click(within(tabsGroup()).getByRole('button', { name: /In my wishlist/ }));
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
});
