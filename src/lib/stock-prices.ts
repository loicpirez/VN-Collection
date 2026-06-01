import { decodeStoredExtras, type ErogePriceExtrasV1 } from './erogeprice-meta';
import { asJsonRecord } from './json-shape';

/** Minimal cached stock payload needed by the price-history section. */
export interface StockSnapshotForPrices {
  statuses?: Array<{ provider: string; extras_json?: string | null }>;
}

function decodeStockSnapshotForPrices(value: unknown): StockSnapshotForPrices | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.statuses)) return null;
  const statuses: Array<{ provider: string; extras_json?: string | null }> = [];
  for (const row of record.statuses) {
    const status = asJsonRecord(row);
    if (
      !status ||
      typeof status.provider !== 'string' ||
      !(status.extras_json === undefined || status.extras_json === null || typeof status.extras_json === 'string')
    ) {
      return null;
    }
    statuses.push({
      provider: status.provider,
      extras_json: status.extras_json,
    });
  }
  return { statuses };
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
  const snapshot = decodeStockSnapshotForPrices(await response.json());
  if (!snapshot) throw new Error('invalid stock payload');
  if (signal.aborted) return null;
  return extrasFromStockSnapshot(snapshot);
}
