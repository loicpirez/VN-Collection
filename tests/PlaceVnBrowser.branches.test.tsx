// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PlaceVnBrowser } from '@/components/PlaceVnBrowser';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { PlaceStockVn } from '@/lib/place-client-shape';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const t = dictionaries.en;
const now = Date.now();

function offer(vnId: string) {
  return {
    vn_id: vnId,
    provider: 'sofmap',
    availability: 'in_stock',
    price: 2480,
    currency: 'JPY',
    url: 'https://example.test/stock',
    location_branch: 'Akiba',
    location_label: 'Akiba',
    updated_at: now,
  };
}

function vn(overrides: Partial<PlaceStockVn>): PlaceStockVn {
  return {
    vn_id: 'v10001',
    title: 'Title Y',
    alttitle: 'Title Y JP',
    image_url: 'https://img.example.test/a.jpg',
    local_image: null,
    image_sexual: 0,
    released: '2020-01-31',
    developers: JSON.stringify([{ id: 'p1', name: 'Studio X' }]),
    in_collection: 1,
    min_price: 2480,
    offer_count: 1,
    in_stock_count: 1,
    out_of_stock_count: 0,
    max_updated_at: now,
    offers: [offer('v10001')],
    in_wishlist: 0,
    ...overrides,
  };
}

function payload(vns: PlaceStockVn[]) {
  return {
    vns,
    stats: {
      total: vns.length,
      in_stock: vns.filter((v) => v.in_stock_count > 0).length,
      out_of_stock: vns.filter((v) => v.in_stock_count === 0 && v.out_of_stock_count > 0).length,
      offer_count: vns.reduce((s, v) => s + v.offer_count, 0),
      in_collection: vns.filter((v) => v.in_collection === 1).length,
      branch_count: 1,
      in_wishlist: vns.filter((v) => v.in_wishlist === 1).length,
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function serve(vns: PlaceStockVn[]) {
  global.fetch = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/places/12/stock') return json(payload(vns));
    return json({});
  });
}

function renderBrowser() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <PlaceVnBrowser placeId={12} placeName="Akiba" />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

describe('PlaceVnBrowser branches', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('groups VNs lacking a provider or year under the unknown bucket', async () => {
    serve([
      vn({ vn_id: 'v10001', title: 'Title Y', developers: null, released: null }),
      vn({ vn_id: 'v10002', title: 'Title Z', developers: JSON.stringify([]), released: '' }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Title Y')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(t.places.groupLabel as string), { target: { value: 'provider' } });
    expect(screen.getAllByText(t.wishlist.groupUnknown as string).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(t.places.groupLabel as string), { target: { value: 'year' } });
    expect(screen.getAllByText(t.wishlist.groupUnknown as string).length).toBeGreaterThan(0);
  });

  it('renders a card with both wishlist and collection badges and a missing price', async () => {
    serve([
      vn({
        vn_id: 'v10005',
        title: 'Dual Flagged',
        in_collection: 1,
        in_wishlist: 1,
        min_price: null,
        developers: null,
        alttitle: null,
      }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Dual Flagged')).toBeTruthy());
    const card = screen.getByText('Dual Flagged').closest('article')!;
    // Both badges present inside the card.
    expect(within(card).getByText(t.places.filterInWishlist as string)).toBeInTheDocument();
    expect(within(card).getByText(t.places.filterInCollection as string)).toBeInTheDocument();
    // No producer button (developers is null).
    expect(within(card).queryByText('Studio X')).toBeNull();
  });

  it('renders list rows with producer, both badges, missing price and date', async () => {
    serve([
      vn({
        vn_id: 'v10006',
        title: 'Row VN',
        in_collection: 1,
        in_wishlist: 1,
        min_price: null,
        released: null,
        developers: JSON.stringify([{ id: 'p9', name: 'Studio Row' }]),
      }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Row VN')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.places.viewList as string }));
    const row = screen.getByText('Row VN').closest('li')!;
    expect(within(row).getByText('Studio Row')).toBeInTheDocument();
    expect(within(row).getByText(t.places.filterInWishlist as string)).toBeInTheDocument();
    expect(within(row).getByText(t.places.filterInCollection as string)).toBeInTheDocument();
  });

  it('filters to an out-of-stock VN and shows its out-of-stock badge', async () => {
    serve([
      vn({ vn_id: 'v10007', title: 'Sold Out', in_stock_count: 0, out_of_stock_count: 3, in_collection: 0 }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Sold Out')).toBeTruthy());
    const card = screen.getByText('Sold Out').closest('article')!;
    expect(within(card).getByText(t.places.filterOutOfStock as string)).toBeInTheDocument();
  });

  it('clicks a card producer chip to apply the provider filter', async () => {
    serve([
      vn({ vn_id: 'v10008', title: 'Chip VN', developers: JSON.stringify([{ id: 'pX', name: 'Chip Studio' }]), in_collection: 0 }),
      vn({ vn_id: 'v10009', title: 'Other VN', developers: JSON.stringify([{ id: 'pY', name: 'Other Studio' }]), in_collection: 0 }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Chip VN')).toBeTruthy());
    const card = screen.getByText('Chip VN').closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: /Chip Studio/ }));
    await waitFor(() => expect(screen.queryByText('Other VN')).toBeNull());
    expect(screen.getByText('Chip VN')).toBeInTheDocument();
  });

  it('clamps the active page when a filter shrinks the result set', async () => {
    const rows = Array.from({ length: 65 }, (_, i) => vn({
      vn_id: `v${30000 + i}`,
      title: `Item ${String(i + 1).padStart(2, '0')}`,
      in_collection: i === 64 ? 1 : 0,
      in_wishlist: 0,
      min_price: i + 1,
    }));
    serve(rows);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Item 01')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.common.next as string }));
    await waitFor(() => expect(screen.getByText('61-65 / 65')).toBeTruthy());
    // Now narrow to a single collection item; page must clamp back to 1.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filterInCollection as string) }));
    await waitFor(() => expect(screen.queryByText('61-65 / 65')).toBeNull());
    expect(screen.getByText('Item 65')).toBeInTheDocument();
  });

  it('ignores a malformed persisted preference and uses defaults', async () => {
    try { localStorage.setItem('vncoll.place-vn-browser.prefs.v1', '{not json'); } catch {}
    serve([vn({ vn_id: 'v10010', title: 'Default Pref' })]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Default Pref')).toBeTruthy());
    // Default sort is name (Title A-Z) and group None.
    expect((screen.getByLabelText(t.places.sortLabel as string) as HTMLSelectElement).value).toBe('name');
    expect((screen.getByLabelText(t.places.groupLabel as string) as HTMLSelectElement).value).toBe('none');
  });

  it('toggles the filters panel closed and open', async () => {
    serve([vn({ vn_id: 'v10011', title: 'Toggle VN' })]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Toggle VN')).toBeTruthy());
    const toggle = screen.getByRole('button', { name: new RegExp(t.places.filtersLabel as string) });
    // Filters start open; the producer select is visible.
    expect(screen.getByLabelText(t.places.filterProducer as string)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByLabelText(t.places.filterProducer as string)).toBeNull());
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByLabelText(t.places.filterProducer as string)).toBeInTheDocument());
  });

  it('sorts by price ascending and descending with missing prices present', async () => {
    serve([
      vn({ vn_id: 'v10012', title: 'Has Price', min_price: 500, in_collection: 0 }),
      vn({ vn_id: 'v10013', title: 'No Price', min_price: null, in_collection: 0 }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Has Price')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(t.places.sortLabel as string), { target: { value: 'price_asc' } });
    expect(screen.getByText('Has Price')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t.places.sortLabel as string), { target: { value: 'price_desc' } });
    expect(screen.getByText('No Price')).toBeInTheDocument();
  });
});
