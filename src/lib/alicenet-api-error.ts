import 'server-only';
import { NextResponse } from 'next/server';
import { apiErrorBody } from './api-error-shape';

const TOKEN_VALUE_RE = /([?&](?:key|token|password|secret|api_key|access_token)=)[^&\s]+/gi;
const LOCAL_PATH_RE = /\/Users\/[^\s)]+/g;

function sanitizeAliceNetErrorText(value: string): string {
  return value
    .replace(TOKEN_VALUE_RE, '$1[redacted]')
    .replace(LOCAL_PATH_RE, '[local path]')
    .trim();
}

type AliceNetErrorCode =
  | 'alicenet_dns_failure'
  | 'alicenet_timeout'
  | 'alicenet_connection_refused'
  | 'alicenet_rate_limited'
  | 'alicenet_upstream_unavailable'
  | 'alicenet_forbidden'
  | 'alicenet_not_found'
  | 'alicenet_parse_failed'
  | 'alicenet_operation_failed';

interface ClassifiedAliceNetError {
  error: string;
  code: AliceNetErrorCode;
}

/**
 * Classify and sanitize an AliceNet failure for API and background-job use.
 *
 * @param error Thrown upstream value.
 * @param fallback Safe message used when the thrown value has no text.
 * @returns Stable diagnostic code plus a sanitized fallback message.
 */
export function classifyAliceNetError(error: unknown, fallback: string): ClassifiedAliceNetError {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = message.toLowerCase();
  if (/enotfound|getaddrinfo|dns/.test(lower)) {
    return { error: 'AliceNet host could not be resolved. Check DNS, network, or proxy settings.', code: 'alicenet_dns_failure' };
  }
  if (/timeout|etimedout|timed out/.test(lower)) {
    return { error: 'AliceNet request timed out. Check the network or proxy, then retry.', code: 'alicenet_timeout' };
  }
  if (/econnrefused|proxy connection refused/.test(lower)) {
    return { error: 'AliceNet connection was refused. Check the configured proxy or source availability.', code: 'alicenet_connection_refused' };
  }
  if (/alicenet[^\n]*\b429\b|\b429\b[^\n]*alicenet/.test(lower)) {
    return { error: 'AliceNet is rate limiting requests. Wait before retrying or reduce the request rate.', code: 'alicenet_rate_limited' };
  }
  if (/alicenet[^\n]*\b5\d\d\b|\b5\d\d\b[^\n]*alicenet/.test(lower)) {
    return { error: 'AliceNet is temporarily unavailable. Retry later or check the AliceNet proxy settings.', code: 'alicenet_upstream_unavailable' };
  }
  if (/forbidden|http 403|\b403\b/.test(lower)) {
    return { error: 'AliceNet rejected the request. Check source availability or proxy access.', code: 'alicenet_forbidden' };
  }
  if (/not found|http 404|\b404\b/.test(lower)) {
    return { error: 'AliceNet source page was not found. The source URL may have changed.', code: 'alicenet_not_found' };
  }
  if (/no rows|empty|parse|malformed/.test(lower)) {
    return { error: 'AliceNet source page loaded, but no stock rows could be parsed.', code: 'alicenet_parse_failed' };
  }
  return { error: sanitizeAliceNetErrorText(message) || fallback, code: 'alicenet_operation_failed' };
}

/**
 * Builds a sanitized AliceNet API error response while keeping enough detail
 * for the UI to explain what failed.
 *
 * @param error Thrown value from the AliceNet route.
 * @param fallback User-facing fallback when no meaningful message exists.
 * @param status HTTP status for the API response.
 * @param context Stable route context included in the response.
 * @returns JSON response with a sanitized error and stable diagnostic code.
 */
export function aliceNetApiError(error: unknown, fallback: string, status: number, context = 'alicenet'): NextResponse {
  const classified = classifyAliceNetError(error, fallback);
  return NextResponse.json(apiErrorBody(classified.error, classified.code, context), { status });
}
