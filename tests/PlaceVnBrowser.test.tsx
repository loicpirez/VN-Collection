// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PlaceVnBrowser } from '@/components/PlaceVnBrowser';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import type { PlaceStockVn } from '@/lib/place-client-shape';

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const t = dictionaries[DEFAULT_LOCALE];
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
    title: 'Aikiss',
    alttitle: 'Aikiss JP',
    image_url: 'https://img.example.test/a.jpg',
    local_image: null,
    image_sexual: 0,
    released: '2020-01-31',
    developers: JSON.stringify([{ id: 'p1', name: 'Giga' }]),
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

function stockPayload(vns: PlaceStockVn[] = [
  vn({ vn_id: 'v10001', title: 'Aikiss', in_collection: 1, in_wishlist: 0, in_stock_count: 1, out_of_stock_count: 0, min_price: 2480, released: '2020-01-31' }),
  vn({
    vn_id: 'v10002',
    title: 'KimiKiss',
    alttitle: null,
    developers: JSON.stringify([{ id: 'p2', name: 'Enterbrain' }]),
    in_collection: 0,
    in_wishlist: 1,
    in_stock_count: 0,
    out_of_stock_count: 2,
    min_price: null,
    released: null,
    offers: [offer('v10002')],
  }),
  vn({
    vn_id: 'v10003',
    title: 'Canvas',
    developers: JSON.stringify([{ id: 'p1', name: 'Giga' }]),
    in_collection: 0,
    in_wishlist: 0,
    in_stock_count: 1,
    out_of_stock_count: 0,
    min_price: 980,
    released: '1999-11-05',
    offers: [offer('v10003')],
  }),
]) {
  return {
    vns,
    stats: {
      total: vns.length,
      in_stock: vns.filter((item) => item.in_stock_count > 0).length,
      out_of_stock: vns.filter((item) => item.in_stock_count === 0 && item.out_of_stock_count > 0).length,
      offer_count: vns.reduce((sum, item) => sum + item.offer_count, 0),
      in_collection: vns.filter((item) => item.in_collection === 1).length,
      branch_count: 2,
      in_wishlist: vns.filter((item) => item.in_wishlist === 1).length,
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderBrowser() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <PlaceVnBrowser placeId={12} placeName="Akiba" />
    </DisplaySettingsProvider>,
  );
}

describe('PlaceVnBrowser', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/places/12/stock') return json(stockPayload());
      return json({});
    });
  });

  it('loads stock and filters by status, provider, price, search, grouping, and view mode', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Aikiss')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filterOutOfStock as string) }));
    expect(screen.getByText('KimiKiss')).toBeTruthy();
    expect(screen.queryByText('Aikiss')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filterInCollection as string) }));
    expect(screen.getByText('Aikiss')).toBeTruthy();
    expect(screen.queryByText('KimiKiss')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filterInWishlist as string) }));
    expect(screen.getByText('KimiKiss')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filterAll as string) }));
    fireEvent.change(screen.getByLabelText(t.places.filterProducer as string), { target: { value: 'p1' } });
    expect(screen.getByText('Canvas')).toBeTruthy();
    expect(screen.queryByText('KimiKiss')).toBeNull();

    fireEvent.change(screen.getByLabelText(t.places.priceMin as string), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(t.places.priceMax as string), { target: { value: '3000' } });
    expect(screen.getByText('Aikiss')).toBeTruthy();
    expect(screen.queryByText('Canvas')).toBeNull();

    fireEvent.change(screen.getByLabelText(t.places.groupLabel as string), { target: { value: 'provider' } });
    expect(screen.getByText('Giga')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.places.groupLabel as string), { target: { value: 'year' } });
    expect(screen.getByText('2020')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.places.vnBrowserSearch as string), { target: { value: 'v10001' } });
    await waitFor(() => expect(screen.getByText('Aikiss')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: t.places.viewList as string }));
    expect(screen.getByText('Aikiss')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.places.resetFilters as string }));
    await waitFor(() => expect(screen.getByText('KimiKiss')).toBeTruthy());
  });

  it('restores saved preferences and sorts prices both directions', async () => {
    localStorage.setItem('vncoll.place-vn-browser.prefs.v1', JSON.stringify({ sort: 'price_desc', group: 'provider', view: 'list' }));
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Aikiss')).toBeTruthy());
    expect(screen.getByText('Giga')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.places.sortLabel as string), { target: { value: 'price_asc' } });
    expect(screen.getByText('Canvas')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.places.sortLabel as string), { target: { value: 'fresh' } });
    expect(screen.getByText('Aikiss')).toBeTruthy();
  });

  it('paginates long stock lists', async () => {
    const rows = Array.from({ length: 65 }, (_, index) => vn({
      vn_id: `v${20000 + index}`,
      title: `VN ${String(index + 1).padStart(2, '0')}`,
      min_price: index + 1,
      in_collection: 0,
      in_wishlist: 0,
    }));
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/places/12/stock') return json(stockPayload(rows));
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('VN 01')).toBeTruthy());
    expect(screen.getByText('1-60 / 65')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.next as string }));
    await waitFor(() => expect(screen.getByText('61-65 / 65')).toBeTruthy());
    expect(screen.getByText('VN 65')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.prev as string }));
    await waitFor(() => expect(screen.getByText('1-60 / 65')).toBeTruthy());
  });

  it('shows empty, filtered-empty, and load-error states', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/places/12/stock') return json(stockPayload([]));
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText(t.places.vnBrowserEmpty as string)).toBeTruthy());

    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/places/12/stock') return json(stockPayload());
      return json({});
    });
    const { unmount } = renderBrowser();
    await waitFor(() => expect(screen.getByText('Aikiss')).toBeTruthy());
    fireEvent.change(screen.getAllByLabelText(t.places.priceMin as string)[1], { target: { value: '99999' } });
    expect(screen.getByText(t.places.vnBrowserAllFiltered as string)).toBeTruthy();
    unmount();

    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/places/12/stock') return json({ error: 'stock failed' }, 500);
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('stock failed')).toBeTruthy());
  });
});
