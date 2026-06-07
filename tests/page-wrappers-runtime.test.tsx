import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MapPage, { generateMetadata as generateMapMetadata } from '@/app/map/page';
import PlacesPage, { generateMetadata as generatePlacesMetadata } from '@/app/places/page';
import PlacePage, { generateMetadata as generatePlaceMetadata } from '@/app/places/[id]/page';
import SearchPage, { generateMetadata as generateSearchMetadata } from '@/app/search/page';
import SeriesPage, { generateMetadata as generateSeriesMetadata } from '@/app/series/page';
import StockPage, { generateMetadata as generateStockMetadata } from '@/app/stock/page';
import TraitsPage, { generateMetadata as generateTraitsMetadata } from '@/app/traits/page';
import WishlistPage, { generateMetadata as generateWishlistMetadata } from '@/app/wishlist/page';
import { getCacheFreshness, getPlace, listPlaces, listSeries } from '@/lib/db';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import type { PlaceWithLinks } from '@/lib/db';
import type { SeriesRow } from '@/lib/types';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
  redirect: navigationMocks.redirect,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock('@/lib/db', () => ({
  getCacheFreshness: vi.fn(),
  getPlace: vi.fn(),
  listPlaces: vi.fn(),
  listSeries: vi.fn(),
}));

vi.mock('@/components/MapPageClient', () => ({
  MapPageClient: (props: Record<string, unknown>) => <div data-testid="map" data-props={JSON.stringify(props)} />,
}));

vi.mock('@/components/PlaceBrowser', () => ({
  PlaceBrowser: () => <div data-testid="places" />,
}));

vi.mock('@/components/PlaceDetailClient', () => ({
  PlaceDetailClient: ({ place }: { place: PlaceWithLinks }) => <div data-testid="place-detail">{place.name}</div>,
}));

vi.mock('@/components/SearchClient', () => ({
  SearchClient: () => <div data-testid="search" />,
}));

vi.mock('@/components/SeriesManager', () => ({
  SeriesManager: ({ initial }: { initial: SeriesRow[] }) => <div data-testid="series">{initial.map((row) => row.name).join(',')}</div>,
}));

vi.mock('@/components/StockLookupClient', () => ({
  StockLookupClient: ({ initialVnId }: { initialVnId: string | null }) => <div data-testid="stock">{initialVnId ?? 'none'}</div>,
}));

vi.mock('@/components/TraitsBrowser', () => ({
  TraitsBrowser: ({ lastUpdatedAt }: { lastUpdatedAt: number | null }) => <div data-testid="traits">{lastUpdatedAt ?? 'none'}</div>,
}));

vi.mock('@/components/WishlistClient', () => ({
  WishlistClient: () => <div data-testid="wishlist" />,
}));

const place: PlaceWithLinks = {
  id: 7,
  name: 'Akihabara',
  name_ja: null,
  kind: 'shop',
  address: null,
  lat: 35.7,
  lng: 139.7,
  url: null,
  notes: null,
  created_at: 1,
  updated_at: 2,
  provider_labels: [],
  stock_count: 0,
};

const series: SeriesRow = {
  id: 3,
  name: 'Series name',
  description: null,
  cover_path: null,
  banner_path: null,
  created_at: 1,
  updated_at: 2,
};

const t = dictionaries[DEFAULT_LOCALE];

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  navigationMocks.redirect.mockClear();
  vi.mocked(getCacheFreshness).mockReset().mockReturnValue(null);
  vi.mocked(getPlace).mockReset().mockReturnValue(null);
  vi.mocked(listPlaces).mockReset().mockReturnValue([place]);
  vi.mocked(listSeries).mockReset().mockReturnValue([series]);
});

describe('thin App Router page wrappers', () => {
  it('maps valid and invalid map focus parameters', async () => {
    expect(await generateMapMetadata()).toEqual({ title: t.map.title });
    let html = renderToStaticMarkup(await MapPage({
      searchParams: Promise.resolve({ lat: '35.6', lng: '139.8', place: '7' }),
    }));
    expect(html).toContain('&quot;focusLat&quot;:35.6');
    expect(html).toContain('&quot;focusLng&quot;:139.8');
    expect(html).toContain('&quot;focusId&quot;:7');

    html = renderToStaticMarkup(await MapPage({
      searchParams: Promise.resolve({ lat: '100', lng: 'invalid', id: '-1' }),
    }));
    expect(html).toContain('&quot;focusLat&quot;:null');
    expect(html).toContain('&quot;focusLng&quot;:null');
    expect(html).toContain('&quot;focusId&quot;:null');
  });

  it('renders places metadata, browser, detail fallback, detail metadata, and detail body', async () => {
    expect(await generatePlacesMetadata()).toEqual({ title: t.places.title });
    expect(renderToStaticMarkup(await PlacesPage())).toContain('data-testid="places"');
    expect(await generatePlaceMetadata({ params: Promise.resolve({ id: '7' }) })).toEqual({ title: t.places.title });
    await expect(PlacePage({ params: Promise.resolve({ id: '7' }) })).rejects.toThrow('not-found');

    vi.mocked(getPlace).mockReturnValue(place);
    expect(await generatePlaceMetadata({ params: Promise.resolve({ id: '7' }) })).toEqual({
      title: `Akihabara | ${t.places.title}`,
    });
    expect(renderToStaticMarkup(await PlacePage({ params: Promise.resolve({ id: '7' }) }))).toContain('Akihabara');
  });

  it('normalizes valid stock ids and rejects invalid stock ids', async () => {
    expect(await generateStockMetadata()).toEqual({ title: t.stock.pageTitle });
    expect(renderToStaticMarkup(await StockPage({ searchParams: Promise.resolve({ vn: ['V90001', 'v90002'] }) }))).toContain('v90001');
    expect(renderToStaticMarkup(await StockPage({ searchParams: Promise.resolve({ vn: 'invalid' }) }))).toContain('none');
    expect(renderToStaticMarkup(await StockPage({ searchParams: Promise.resolve({}) }))).toContain('none');
  });

  it('renders search, series, traits, and wishlist wrappers with localized metadata', async () => {
    vi.mocked(getCacheFreshness).mockReturnValue(123);
    expect(await generateSearchMetadata()).toEqual({ title: t.nav.search });
    expect(renderToStaticMarkup(<SearchPage />)).toContain('data-testid="search"');
    expect(await generateSeriesMetadata()).toEqual({ title: t.nav.series });
    expect(renderToStaticMarkup(<SeriesPage />)).toContain('Series name');
    expect(await generateTraitsMetadata()).toEqual({ title: t.nav.traits });
    expect(renderToStaticMarkup(<TraitsPage />)).toContain('123');
    expect(await generateWishlistMetadata()).toEqual({ title: t.nav.wishlist });
    expect(renderToStaticMarkup(<WishlistPage />)).toContain('data-testid="wishlist"');
    expect(getCacheFreshness).toHaveBeenCalledWith(['% /trait|%', 'trait_full:%']);
    expect(listSeries).toHaveBeenCalledTimes(1);
  });
});
