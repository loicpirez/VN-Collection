'use client';

import { useEffect, useState } from 'react';

const VALID_LOCALES = ['fr', 'en', 'ja'];

function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const loc = match?.[1];
  return loc && VALID_LOCALES.includes(loc) ? loc : null;
}

/**
 * Top-level error boundary for crashes in the root layout itself.
 * `app/error.tsx` only catches errors INSIDE the layout — but the
 * layout can also throw (font loading, i18n provider, cookie
 * parsing). When that happens, this is the last line of defense
 * before Next.js shows its default error page.
 *
 * Renders its own <html>/<body> per Next 15's contract for
 * global-error.tsx. Uses the locale cookie when available so
 * the lang attribute reflects the user's actual language setting.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<string>('fr');

  useEffect(() => {
    console.error('Global error:', error);
    const loc = readLocaleCookie();
    if (loc) setLang(loc);
  }, [error]);

  return (
    <html lang={lang}>
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
