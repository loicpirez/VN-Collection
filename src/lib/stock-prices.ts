import { decodeStoredExtras, type ErogePriceExtrasV1 } from './erogeprice-meta';

/** Minimal cached stock payload needed by the price-history section. */
export interface StockSnapshotForPrices {
  statuses?: Array<{ provider: string; extras_json?: string | null }>;
}

/**
 * Read validated ErogePrice extras from a cached stock snapshot.
 *
 * @param snapshot Cached stock provider payload.
 * @returns Parsed version-one extras, or null when no usable payload exists.
 */
export function extrasFromStockSnapshot(
  snapshot: StockSnapshotForPrices | null | undefined,
): ErogePriceExtrasV1 | null {
  const row = (snapshot?.statuses ?? []).find((status) => status.provider === 'eroge_price');
  return decodeStoredExtras(row?.extras_json);
}

/**
 * Fetch the cached price-history payload for one VN.
 *
 * @param vnId VN identifier used by the stock API route.
 * @param signal Abort signal owned by the active VN detail view.
 * @param request Fetch implementation, injectable for deterministic tests.
 * @returns Parsed version-one ErogePrice extras, or null when unavailable or aborted.
 */
export async function fetchStockPriceExtras(
  vnId: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<ErogePriceExtrasV1 | null> {
  const response = await request(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const snapshot = (await response.json()) as StockSnapshotForPrices | null;
  if (signal.aborted) return null;
  return extrasFromStockSnapshot(snapshot);
}
