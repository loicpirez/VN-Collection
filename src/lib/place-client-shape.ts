import { asJsonRecord } from './json-shape';
import { hasFiniteCoordinates } from './place-coordinates';
import { isValidVnId, normalizeVnId } from './vn-id-shape';
import type { PlaceOfferRow, PlaceVnRow, PlaceWithLinks } from './db';

/** Place-stock statistics returned by the place browser endpoint. */
export interface PlaceStockStats {
  total: number;
  in_stock: number;
  out_of_stock: number;
  offer_count: number;
  in_collection: number;
  branch_count: number;
  in_wishlist: number;
}

/** Place-stock VN row with its matching offer rows and wishlist indicator. */
export type PlaceStockVn = PlaceVnRow & { offers: PlaceOfferRow[]; in_wishlist: number };

/** Provider branch currently linked to another place. */
export interface OtherPlaceBranch {
  provider_label: string;
  place_id: number;
  place_name: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function isIndicator(value: unknown): value is number {
  return value === 0 || value === 1;
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeArray<T>(value: unknown, decodeRow: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const row of value) {
    const decoded = decodeRow(row);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodePlace(value: unknown): PlaceWithLinks | null {
  const record = asJsonRecord(value);
  const providerLabels = decodeStringArray(record?.provider_labels);
  if (
    !record ||
    !isIntegerAtLeast(record.id, 1) ||
    !isString(record.name) ||
    !isNullableString(record.name_ja) ||
    !(record.kind === 'shop' || record.kind === 'chain' || record.kind === 'storage') ||
    !isNullableString(record.address) ||
    !isNullableNumber(record.lat) ||
    !isNullableNumber(record.lng) ||
    !isNullableString(record.url) ||
    !isNullableString(record.notes) ||
    !isFiniteNumber(record.created_at) ||
    !isFiniteNumber(record.updated_at) ||
    !providerLabels ||
    !isIntegerAtLeast(record.stock_count, 0)
  ) {
    return null;
  }
  const coordinates = { lat: record.lat, lng: record.lng };
  if ((record.lat !== null || record.lng !== null) && !hasFiniteCoordinates(coordinates)) return null;
  return {
    id: record.id,
    name: record.name,
    name_ja: record.name_ja,
    kind: record.kind,
    address: record.address,
    lat: record.lat,
    lng: record.lng,
    url: record.url,
    notes: record.notes,
    created_at: record.created_at,
    updated_at: record.updated_at,
    provider_labels: providerLabels,
    stock_count: record.stock_count,
  };
}

function decodePlaceOffer(value: unknown): PlaceOfferRow | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.vn_id) ||
    !isValidVnId(record.vn_id) ||
    !isString(record.provider) ||
    !isString(record.availability) ||
    !isNullableNumber(record.price) ||
    !isNullableString(record.currency) ||
    !isNullableString(record.url) ||
    !isNullableString(record.location_branch) ||
    !isNullableString(record.location_label) ||
    !isFiniteNumber(record.updated_at)
  ) {
    return null;
  }
  return {
    vn_id: normalizeVnId(record.vn_id),
    provider: record.provider,
    availability: record.availability,
    price: record.price,
    currency: record.currency,
    url: record.url,
    location_branch: record.location_branch,
    location_label: record.location_label,
    updated_at: record.updated_at,
  };
}

function decodePlaceStockVn(value: unknown): PlaceStockVn | null {
  const record = asJsonRecord(value);
  const offers = decodeArray(record?.offers, decodePlaceOffer);
  if (
    !record ||
    !isString(record.vn_id) ||
    !isValidVnId(record.vn_id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.image_url) ||
    !isNullableString(record.local_image) ||
    !isNullableNumber(record.image_sexual) ||
    !isNullableString(record.released) ||
    !isNullableString(record.developers) ||
    !isIndicator(record.in_collection) ||
    !isNullableNumber(record.min_price) ||
    !isIntegerAtLeast(record.offer_count, 0) ||
    !isIntegerAtLeast(record.in_stock_count, 0) ||
    !isIntegerAtLeast(record.out_of_stock_count, 0) ||
    !isFiniteNumber(record.max_updated_at) ||
    !offers ||
    !isIndicator(record.in_wishlist)
  ) {
    return null;
  }
  return {
    vn_id: normalizeVnId(record.vn_id),
    title: record.title,
    alttitle: record.alttitle,
    image_url: record.image_url,
    local_image: record.local_image,
    image_sexual: record.image_sexual,
    released: record.released,
    developers: record.developers,
    in_collection: record.in_collection,
    min_price: record.min_price,
    offer_count: record.offer_count,
    in_stock_count: record.in_stock_count,
    out_of_stock_count: record.out_of_stock_count,
    max_updated_at: record.max_updated_at,
    offers,
    in_wishlist: record.in_wishlist,
  };
}

function decodePlaceStockStats(value: unknown): PlaceStockStats | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isIntegerAtLeast(record.total, 0) ||
    !isIntegerAtLeast(record.in_stock, 0) ||
    !isIntegerAtLeast(record.out_of_stock, 0) ||
    !isIntegerAtLeast(record.offer_count, 0) ||
    !isIntegerAtLeast(record.in_collection, 0) ||
    !isIntegerAtLeast(record.branch_count, 0) ||
    !isIntegerAtLeast(record.in_wishlist, 0)
  ) {
    return null;
  }
  return {
    total: record.total,
    in_stock: record.in_stock,
    out_of_stock: record.out_of_stock,
    offer_count: record.offer_count,
    in_collection: record.in_collection,
    branch_count: record.branch_count,
    in_wishlist: record.in_wishlist,
  };
}

/**
 * Decode the registry response used by the places browser.
 *
 * @param value Parsed local API payload.
 * @returns Safe place registry state, or `null` for malformed input.
 */
export function decodePlacesResponse(value: unknown): {
  places: PlaceWithLinks[];
  known_places: string[];
} | null {
  const record = asJsonRecord(value);
  const places = decodeArray(record?.places, decodePlace);
  const knownPlaces = decodeStringArray(record?.known_places);
  return places && knownPlaces ? { places, known_places: knownPlaces } : null;
}

/**
 * Decode physical-location autocomplete suggestions.
 *
 * @param value Parsed local API payload.
 * @returns Safe suggestion rows, or `null` for malformed input.
 */
export function decodeKnownPlacesResponse(value: unknown): string[] | null {
  return decodeStringArray(asJsonRecord(value)?.known_places);
}

/**
 * Decode unassigned provider branch rows.
 *
 * @param value Parsed local API payload.
 * @returns Safe branch rows, or `null` for malformed input.
 */
export function decodeUnassignedBranchesResponse(value: unknown): string[] | null {
  return decodeStringArray(asJsonRecord(value)?.branches);
}

/**
 * Decode provider branches linked to other places.
 *
 * @param value Parsed local API payload.
 * @returns Safe branch rows, or `null` for malformed input.
 */
export function decodeOtherPlaceBranchesResponse(value: unknown): OtherPlaceBranch[] | null {
  return decodeArray(asJsonRecord(value)?.branches, (row) => {
    const record = asJsonRecord(row);
    if (
      !record ||
      !isString(record.provider_label) ||
      !isIntegerAtLeast(record.place_id, 1) ||
      !isString(record.place_name)
    ) {
      return null;
    }
    return {
      provider_label: record.provider_label,
      place_id: record.place_id,
      place_name: record.place_name,
    };
  });
}

/**
 * Decode a place provider-map response.
 *
 * @param value Parsed local API payload.
 * @returns Safe provider map, or `null` for malformed input.
 */
export function decodePlaceProviderMapResponse(value: unknown): Record<string, number> | null {
  const map = asJsonRecord(asJsonRecord(value)?.map);
  if (!map) return null;
  const out: Record<string, number> = {};
  for (const [label, id] of Object.entries(map)) {
    if (!isIntegerAtLeast(id, 1)) return null;
    out[label] = id;
  }
  return out;
}

/**
 * Decode the place-creation response before chaining follow-up writes.
 *
 * @param value Parsed local API payload.
 * @returns Created place id, or `null` for malformed input.
 */
export function decodeCreatePlaceResponse(value: unknown): number | null {
  const id = asJsonRecord(value)?.id;
  return isIntegerAtLeast(id, 1) ? id : null;
}

/**
 * Decode the rich per-place stock response.
 *
 * @param value Parsed local API payload.
 * @returns Safe stock browser state, or `null` for malformed input.
 */
export function decodePlaceStockResponse(value: unknown): {
  vns: PlaceStockVn[];
  stats: PlaceStockStats;
} | null {
  const record = asJsonRecord(value);
  const vns = decodeArray(record?.vns, decodePlaceStockVn);
  const stats = decodePlaceStockStats(record?.stats);
  return vns && stats ? { vns, stats } : null;
}
