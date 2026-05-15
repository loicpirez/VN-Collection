'use client';

import { useEffect } from 'react';

/**
 * Top-level error boundary for crashes in the root layout itself.
 * `app/error.tsx` only catches errors INSIDE the layout — but the
 * layout can also throw (font loading, i18n provider, cookie
 * parsing). When that happens, this is the last line of defense
 * before Next.js shows its default error page.
 *
 * Renders its own <html>/<body> per Next 15's contract for
 * global-error.tsx. Intentionally locale-blind (no i18n provider
 * at this level) — uses minimal English copy that's universal
 * enough not to be jarring.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40, background: '#0b1220', color: '#fff' }}>
        <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Something broke.
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>
            The page hit an unexpected error. Try refreshing — if it persists, restart the server.
          </p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginBottom: 16 }}>
              digest: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: '#fff',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
