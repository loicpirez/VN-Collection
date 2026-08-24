import { isValidVnId, normalizeVnId } from './vn-id-shape';

export type PageQueryRecord = Record<string, string | string[] | undefined>;

/**
 * Read and validate the optional VN identifier accepted by the stock page.
 *
 * @param params Resolved Next.js page query parameters.
 * @returns A normalized VN identifier, or null when the value is absent or invalid.
 */
export function parseStockVnQuery(params: PageQueryRecord): string | null {
  const raw = params.vn;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isValidVnId(value) ? normalizeVnId(value) : null;
}
