import { describe, expect, it } from 'vitest';
import {
  decodeCreatePlaceResponse,
  decodeKnownPlacesResponse,
  decodeOtherPlaceBranchesResponse,
  decodePlaceProviderMapResponse,
  decodePlacesResponse,
  decodePlaceStockResponse,
  decodeUnassignedBranchesResponse,
} from '../src/lib/place-client-shape';

const place = {
  id: 1,
  name: 'Shop',
  name_ja: null,
  kind: 'shop',
  address: null,
  lat: 35.1,
  lng: 135.2,
  url: null,
  notes: null,
  created_at: 1,
  updated_at: 2,
  provider_labels: ['Branch'],
  stock_count: 1,
};

const offer = {
  vn_id: 'v90001',
  provider: 'shop',
  availability: 'in_stock',
  price: 1000,
  currency: 'JPY',
  url: null,
  location_branch: 'Branch',
  location_label: null,
  updated_at: 2,
};

const stockVn = {
  vn_id: 'V90001',
  title: 'Entry',
  alttitle: null,
  image_url: null,
  local_image: null,
  image_sexual: null,
  released: null,
  developers: null,
  in_collection: 1,
  min_price: 1000,
  offer_count: 1,
  in_stock_count: 1,
  out_of_stock_count: 0,
  max_updated_at: 2,
  offers: [offer],
  in_wishlist: 0,
};

const stats = {
  total: 1,
  in_stock: 1,
  out_of_stock: 0,
  offer_count: 1,
  in_collection: 1,
  branch_count: 1,
  in_wishlist: 0,
};

describe('place client response adapters', () => {
  it('decodes registry, autocomplete, branches, maps, and creation ids', () => {
    expect(decodePlacesResponse({ places: [place], known_places: ['Shelf'] })?.places).toHaveLength(1);
    expect(decodeKnownPlacesResponse({ known_places: ['Shelf'] })).toEqual(['Shelf']);
    expect(decodeUnassignedBranchesResponse({ branches: ['Branch'] })).toEqual(['Branch']);
    expect(decodeOtherPlaceBranchesResponse({
      branches: [{ provider_label: 'Branch', place_id: 1, place_name: 'Shop' }],
    })).toHaveLength(1);
    expect(decodePlaceProviderMapResponse({ map: { Branch: 1 } })).toEqual({ Branch: 1 });
    expect(decodeCreatePlaceResponse({ id: 1 })).toBe(1);
  });

  it('decodes rich stock rows and canonicalizes ids', () => {
    expect(decodePlaceStockResponse({ vns: [stockVn], stats })?.vns[0]?.vn_id).toBe('v90001');
  });

  it('rejects malformed payloads before client state replacement', () => {
    expect(decodePlacesResponse({ places: [{ ...place, lat: 91 }], known_places: [] })).toBeNull();
    expect(decodePlacesResponse({ places: [{ ...place, id: 0 }], known_places: [] })).toBeNull();
    expect(decodePlacesResponse({ places: [{ ...place, lat: null, lng: 135.2 }], known_places: [] })).toBeNull();
    expect(decodePlacesResponse({ places: [{ ...place, kind: 'chain' }], known_places: [] })?.places[0]?.kind).toBe('chain');
    expect(decodePlacesResponse({ places: [{ ...place, kind: 'storage' }], known_places: [] })?.places[0]?.kind).toBe('storage');
    expect(decodeKnownPlacesResponse({ known_places: [4] })).toBeNull();
    expect(decodeUnassignedBranchesResponse({ branches: null })).toBeNull();
    expect(decodeOtherPlaceBranchesResponse({ branches: [{ provider_label: 'Branch', place_id: 0, place_name: 'Shop' }] })).toBeNull();
    expect(decodeOtherPlaceBranchesResponse({ branches: null })).toBeNull();
    expect(decodePlaceProviderMapResponse({ map: { Branch: '1' } })).toBeNull();
    expect(decodePlaceProviderMapResponse({ map: null })).toBeNull();
    expect(decodeCreatePlaceResponse({ id: 0 })).toBeNull();
    expect(decodePlaceStockResponse({ vns: [{ ...stockVn, offers: [{ ...offer, vn_id: 'bad' }] }], stats })).toBeNull();
    expect(decodePlaceStockResponse({ vns: [stockVn], stats: { ...stats, total: -1 } })).toBeNull();
  });
});
