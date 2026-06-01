import { asJsonRecord } from './json-shape';

/** EGS degradation reported alongside an otherwise successful asset refresh. */
export interface AssetDownloadWarning {
  kind: 'network' | 'server' | 'throttled' | 'blocked';
  status: number | null;
}

/** Client-safe asset refresh response projection. */
export interface AssetDownloadResult {
  ok: boolean;
  error: string | null;
  egs_warning: AssetDownloadWarning | null;
}

function decodeWarning(value: unknown): AssetDownloadWarning | null | undefined {
  if (value === null || value === undefined) return null;
  const record = asJsonRecord(value);
  if (
    !record ||
    !(record.kind === 'network' || record.kind === 'server' || record.kind === 'throttled' || record.kind === 'blocked') ||
    !(record.status === null || (
      typeof record.status === 'number' &&
      Number.isSafeInteger(record.status) &&
      record.status >= 100 &&
      record.status <= 599
    ))
  ) {
    return undefined;
  }
  return { kind: record.kind, status: record.status };
}

/**
 * Decode one asset-refresh API response.
 *
 * @param value Parsed local API payload.
 * @returns Safe asset refresh projection, or `null` for malformed input.
 */
export function decodeAssetDownloadResult(value: unknown): AssetDownloadResult | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const warning = decodeWarning(record.egs_warning);
  if (warning === undefined) return null;
  if (record.ok === true) return { ok: true, error: null, egs_warning: warning };
  if (typeof record.error === 'string') {
    return { ok: false, error: record.error, egs_warning: warning };
  }
  return null;
}
