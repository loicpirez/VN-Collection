import { asJsonRecord } from './json-shape';
import type {
  PhysicalStockMode,
  StockLookupCapability,
  StockResultCapability,
  StockSupportLevel,
} from './stock-provider-capabilities';
import type {
  StockOfferDto,
  StockProviderDto,
  StockSnapshotDto,
  StockSourceDto,
  StockStatusDto,
} from './stock-api-types';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

/** Safe alias mutation or listing response. */
export interface StockAliasesResult {
  aliases: string[] | null;
  error: string | null;
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

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function isAvailability(value: unknown): value is StockOfferDto['availability'] {
  return value === 'in_stock' || value === 'limited' || value === 'out_of_stock' || value === 'unknown' || value === 'error';
}

function isStatus(value: unknown): value is StockStatusDto['status'] {
  return value === 'ok' || value === 'no_results' || value === 'partial' || value === 'protected' || value === 'error' || value === 'skipped' || value === 'not_checked';
}

function isLookupCapability(value: unknown): value is StockLookupCapability {
  return value === 'aggregate_price' || value === 'direct_link' || value === 'jan_lookup' || value === 'title_search' || value === 'cached_inventory';
}

function isResultCapability(value: unknown): value is StockResultCapability {
  return value === 'structured_prices' || value === 'structured_offers' || value === 'search_leads' || value === 'cached_offers';
}

function isSupportLevel(value: unknown): value is StockSupportLevel {
  return value === 'supported' || value === 'limited' || value === 'manual_only';
}

function isPhysicalStockMode(value: unknown): value is PhysicalStockMode {
  return (
    value === 'none' ||
    value === 'online_only' ||
    value === 'single_shop' ||
    value === 'store_locator_only' ||
    value === 'phone_only' ||
    value === 'store_name_online' ||
    value === 'exact_online' ||
    value === 'exact_online_possible_not_implemented' ||
    value === 'exact_online_browser_required' ||
    value === 'exact_cached'
  );
}

function decodeOffer(value: unknown): StockOfferDto | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.vn_id) ||
    !isValidVnId(record.vn_id) ||
    !isString(record.provider) ||
    !isString(record.provider_label) ||
    !isString(record.provider_offer_id) ||
    !isString(record.source) ||
    !isString(record.title) ||
    !isString(record.url) ||
    !isNullableNumber(record.price) ||
    !isString(record.currency) ||
    !isAvailability(record.availability) ||
    !isNullableString(record.availability_label) ||
    !isNullableString(record.condition) ||
    !isNullableString(record.edition_label) ||
    !isNullableString(record.location_label) ||
    !isNullableString(record.location_branch) ||
    !isNullableString(record.source_release_id) ||
    !isNullableString(record.jan) ||
    !isFiniteNumber(record.fetched_at) ||
    !isNullableString(record.error) ||
    !isNullableString(record.content_kind) ||
    !isNullableString(record.platform) ||
    !isNullableString(record.edition_kind) ||
    !isNullableString(record.series_relation) ||
    !isNullableString(record.match_confidence) ||
    !isNullableNumber(record.match_score) ||
    !isNullableString(record.match_warnings_json) ||
    !isNullableNumber(record.marketplace_price) ||
    !isNullableNumber(record.marketplace_count) ||
    !isNullableNumber(record.list_price) ||
    !isNullableString(record.category) ||
    !isNullableString(record.store_code) ||
    !isNullableString(record.product_id) ||
    !isNullableString(record.page_kind)
  ) {
    return null;
  }
  return {
    vn_id: normalizeVnId(record.vn_id),
    provider: record.provider,
    provider_label: record.provider_label,
    provider_offer_id: record.provider_offer_id,
    source: record.source,
    title: record.title,
    url: record.url,
    price: record.price,
    currency: record.currency,
    availability: record.availability,
    availability_label: record.availability_label,
    condition: record.condition,
    edition_label: record.edition_label,
    location_label: record.location_label,
    location_branch: record.location_branch,
    source_release_id: record.source_release_id,
    jan: record.jan,
    fetched_at: record.fetched_at,
    error: record.error,
    content_kind: record.content_kind,
    platform: record.platform,
    edition_kind: record.edition_kind,
    series_relation: record.series_relation,
    match_confidence: record.match_confidence,
    match_score: record.match_score,
    match_warnings_json: record.match_warnings_json,
    marketplace_price: record.marketplace_price,
    marketplace_count: record.marketplace_count,
    list_price: record.list_price,
    category: record.category,
    store_code: record.store_code,
    product_id: record.product_id,
    page_kind: record.page_kind,
  };
}

function decodeStatus(value: unknown): StockStatusDto | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.provider) ||
    !isStatus(record.status) ||
    !isNullableString(record.message) ||
    !isFiniteNumber(record.fetched_at) ||
    !isIntegerAtLeast(record.offer_count, 0) ||
    !isNullableString(record.blocked_kind) ||
    !isIntegerAtLeast(record.fresh_offers_found, 0) ||
    !isIntegerAtLeast(record.cached_offers_available, 0) ||
    !(record.extras_json === undefined || isNullableString(record.extras_json))
  ) {
    return null;
  }
  return {
    provider: record.provider,
    status: record.status,
    message: record.message,
    fetched_at: record.fetched_at,
    offer_count: record.offer_count,
    blocked_kind: record.blocked_kind,
    fresh_offers_found: record.fresh_offers_found,
    cached_offers_available: record.cached_offers_available,
    extras_json: record.extras_json,
  };
}

function decodeProvider(value: unknown): StockProviderDto | null {
  const record = asJsonRecord(value);
  const capabilities = record?.lookupCapabilities === undefined
    ? undefined
    : decodeArray(record.lookupCapabilities, (capability) => isLookupCapability(capability) ? capability : null);
  if (
    !record ||
    !isString(record.id) ||
    !isString(record.label) ||
    !(record.kind === 'direct' || record.kind === 'aggregate' || record.kind === 'cached') ||
    capabilities === null ||
    !(record.resultCapability === undefined || isResultCapability(record.resultCapability)) ||
    !(record.supportLevel === undefined || isSupportLevel(record.supportLevel)) ||
    typeof record.physical !== 'boolean' ||
    !isPhysicalStockMode(record.physicalStockMode) ||
    typeof record.cloudflare !== 'boolean' ||
    typeof record.branchParserImplemented !== 'boolean' ||
    typeof record.confirmedPhysicalUsable !== 'boolean' ||
    !(record.disabled === undefined || typeof record.disabled === 'boolean')
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    kind: record.kind,
    lookupCapabilities: capabilities,
    resultCapability: record.resultCapability,
    supportLevel: record.supportLevel,
    physical: record.physical,
    physicalStockMode: record.physicalStockMode,
    cloudflare: record.cloudflare,
    branchParserImplemented: record.branchParserImplemented,
    confirmedPhysicalUsable: record.confirmedPhysicalUsable,
    disabled: record.disabled,
  };
}

function decodeSource(value: unknown): StockSourceDto | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isIntegerAtLeast(record.id, 1) ||
    !isString(record.vn_id) ||
    !isValidVnId(record.vn_id) ||
    !isNullableString(record.release_id) ||
    !isString(record.provider) ||
    !isString(record.url) ||
    !isNullableString(record.product_id) ||
    !isFiniteNumber(record.created_at) ||
    !isFiniteNumber(record.updated_at)
  ) {
    return null;
  }
  return {
    id: record.id,
    vn_id: normalizeVnId(record.vn_id),
    release_id: record.release_id,
    provider: record.provider,
    url: record.url,
    product_id: record.product_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function decodeSummary(value: unknown): StockSnapshotDto['summary'] | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isIntegerAtLeast(record.total, 0) ||
    !isIntegerAtLeast(record.available, 0) ||
    !isNullableNumber(record.best_price) ||
    !isIntegerAtLeast(record.related_available, 0) ||
    !isIntegerAtLeast(record.needs_review, 0) ||
    !isIntegerAtLeast(record.rejected, 0) ||
    !isNullableNumber(record.last_refresh)
  ) {
    return null;
  }
  return {
    total: record.total,
    available: record.available,
    best_price: record.best_price,
    related_available: record.related_available,
    needs_review: record.needs_review,
    rejected: record.rejected,
    last_refresh: record.last_refresh,
  };
}

/**
 * Decode one stock snapshot response before rendering provider state.
 *
 * @param value Parsed local API payload.
 * @returns Safe stock snapshot, or `null` for malformed input.
 */
export function decodeStockSnapshot(value: unknown): StockSnapshotDto | null {
  const record = asJsonRecord(value);
  const offers = decodeArray(record?.offers, decodeOffer);
  const statuses = decodeArray(record?.statuses, decodeStatus);
  const providers = decodeArray(record?.providers, decodeProvider);
  const sources = decodeArray(record?.sources, decodeSource);
  const summary = decodeSummary(record?.summary);
  return offers && statuses && providers && sources && summary
    ? { offers, statuses, providers, sources, summary }
    : null;
}

/**
 * Decode one alias-list or alias-mutation response.
 *
 * @param value Parsed local API payload.
 * @returns Safe alias projection, or `null` for malformed input.
 */
export function decodeStockAliasesResult(value: unknown): StockAliasesResult | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const aliases = record.aliases === undefined ? null : decodeStringArray(record.aliases);
  const error = record.error === undefined ? null : isString(record.error) ? record.error : undefined;
  if (aliases === null && error === null) return null;
  if (aliases === null && record.aliases !== undefined) return null;
  if (error === undefined) return null;
  return { aliases, error };
}

/**
 * Decode the optional fresh snapshot returned after clearing stock cache.
 *
 * @param value Parsed local API payload.
 * @returns Safe fresh snapshot, or `null` when absent or malformed.
 */
export function decodeClearedStockSnapshot(value: unknown): StockSnapshotDto | null {
  return decodeStockSnapshot(asJsonRecord(value)?.snapshot);
}
