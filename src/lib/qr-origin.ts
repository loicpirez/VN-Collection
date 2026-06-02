export interface QrOriginHeaders {
  forwardedProto: string | null;
  forwardedHost: string | null;
  host: string | null;
}

function firstHeaderValue(raw: string | null): string | null {
  const value = raw?.split(',')[0]?.trim();
  return value || null;
}

function normalizedHost(raw: string | null): string | null {
  const candidate = firstHeaderValue(raw);
  if (!candidate || candidate.length > 320 || /[/\\?#@]/.test(candidate)) return null;
  try {
    const parsed = new URL(`http://${candidate}`);
    return parsed.host;
  } catch {
    return null;
  }
}

/**
 * Build a normalized absolute origin for locally generated QR labels.
 *
 * @param headers Relevant direct and reverse-proxy request headers.
 * @returns A safe HTTP(S) origin with a localhost fallback.
 */
export function qrOriginFromHeaders(headers: QrOriginHeaders): string {
  const forwardedProto = firstHeaderValue(headers.forwardedProto);
  const proto = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : 'http';
  const host = normalizedHost(headers.forwardedHost)
    ?? normalizedHost(headers.host)
    ?? 'localhost:3000';
  return `${proto}://${host}`;
}
