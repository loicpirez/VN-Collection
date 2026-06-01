import { asJsonRecord } from './json-shape';

/** Successful or failed proxy probe result returned with HTTP 200. */
export type ProxyTestResult =
  | { ok: true; latencyMs: number; status: number }
  | { ok: false; latencyMs: number; error: string };

/**
 * Decode one successful proxy-test route response.
 *
 * @param value Parsed local API payload.
 * @returns Safe proxy probe result, or `null` for malformed input.
 */
export function decodeProxyTestResult(value: unknown): ProxyTestResult | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    typeof record.latencyMs !== 'number' ||
    !Number.isSafeInteger(record.latencyMs) ||
    record.latencyMs < 0
  ) {
    return null;
  }
  if (record.ok === true) {
    if (
      typeof record.status !== 'number' ||
      !Number.isSafeInteger(record.status) ||
      record.status < 100 ||
      record.status > 599
    ) {
      return null;
    }
    return { ok: true, latencyMs: record.latencyMs, status: record.status };
  }
  if (record.ok === false && typeof record.error === 'string') {
    return { ok: false, latencyMs: record.latencyMs, error: record.error };
  }
  return null;
}
