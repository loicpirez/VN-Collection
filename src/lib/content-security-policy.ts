const NONCE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Build the per-request CSP consumed by Next.js to nonce its generated scripts.
 *
 * @param nonce Unpredictable base64 value generated for one request.
 * @param environment Runtime environment used for development-only allowances.
 * @returns A normalized Content-Security-Policy header value.
 */
export function contentSecurityPolicy(
  nonce: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error('Invalid CSP nonce');
  const isDevelopment = environment.NODE_ENV === 'development';
  const isInteractionQa = environment.VNCOLL_QA === '1';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? ' ws:' : ''} https://nominatim.openstreetmap.org`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDevelopment || isInteractionQa ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
