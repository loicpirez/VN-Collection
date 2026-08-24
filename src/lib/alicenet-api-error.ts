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

interface ClassifiedAliceNetError {
  error: string;
  code:
    | 'alicenet_dns_failure'
    | 'alicenet_timeout'
    | 'alicenet_connection_refused'
    | 'alicenet_forbidden'
    | 'alicenet_not_found'
    | 'alicenet_parse_failed'
    | 'alicenet_operation_failed';
}

function classifyAliceNetError(message: string, fallback: string): ClassifiedAliceNetError {
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
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const classified = classifyAliceNetError(message, fallback);
  return NextResponse.json(apiErrorBody(classified.error, classified.code, context), { status });
}
