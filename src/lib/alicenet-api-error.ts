import 'server-only';
import { NextResponse } from 'next/server';

const TOKEN_VALUE_RE = /([?&](?:key|token|password|secret|api_key|access_token)=)[^&\s]+/gi;
const LOCAL_PATH_RE = /\/Users\/[^\s)]+/g;

function sanitizeAliceNetErrorText(value: string): string {
  return value
    .replace(TOKEN_VALUE_RE, '$1[redacted]')
    .replace(LOCAL_PATH_RE, '[local path]')
    .trim();
}

function classifyAliceNetError(message: string, fallback: string): string {
  const lower = message.toLowerCase();
  if (/enotfound|getaddrinfo|dns/.test(lower)) return 'AliceNet host could not be resolved. Check DNS, network, or proxy settings.';
  if (/timeout|etimedout|timed out/.test(lower)) return 'AliceNet request timed out. Check the network or proxy, then retry.';
  if (/econnrefused|proxy connection refused/.test(lower)) return 'AliceNet connection was refused. Check the configured proxy or source availability.';
  if (/forbidden|http 403|\b403\b/.test(lower)) return 'AliceNet rejected the request. Check source availability or proxy access.';
  if (/not found|http 404|\b404\b/.test(lower)) return 'AliceNet source page was not found. The source URL may have changed.';
  if (/no rows|empty|parse|malformed/.test(lower)) return 'AliceNet source page loaded, but no stock rows could be parsed.';
  return sanitizeAliceNetErrorText(message) || fallback;
}

/**
 * Builds a sanitized AliceNet API error response while keeping enough detail
 * for the UI to explain what failed.
 *
 * @param error Thrown value from the AliceNet route.
 * @param fallback User-facing fallback when no meaningful message exists.
 * @param status HTTP status for the API response.
 * @returns JSON response with a sanitized `error` string.
 */
export function aliceNetApiError(error: unknown, fallback: string, status: number): NextResponse {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return NextResponse.json({ error: classifyAliceNetError(message, fallback) }, { status });
}
