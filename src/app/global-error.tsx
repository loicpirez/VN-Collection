'use client';

import { useEffect, useState } from 'react';

const VALID_LOCALES = ['fr', 'en', 'ja'] as const;
type SupportedLocale = typeof VALID_LOCALES[number];

function readLocaleCookie(): SupportedLocale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const loc = match?.[1];
  return loc && (VALID_LOCALES as readonly string[]).includes(loc) ? (loc as SupportedLocale) : null;
}

/**
 * U-252: when no `locale` cookie has been set yet (fresh install, or
 * the user has never opened the language switcher), fall back to the
 * navigator's preferred language instead of defaulting to French.
 * This is the only locale-resolution path in the entire app that
 * runs WITHOUT the I18nProvider — so we have to do the matching
 * ourselves.
 */
function readLocaleFromNavigator(): SupportedLocale | null {
  if (typeof navigator === 'undefined') return null;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  for (const lang of langs) {
    const head = lang.toLowerCase().split('-')[0];
    if ((VALID_LOCALES as readonly string[]).includes(head)) {
      return head as SupportedLocale;
    }
  }
  return null;
}

const STRINGS: Record<SupportedLocale, { title: string; body: string; retry: string; digest: string }> = {
  fr: {
    title: 'Une erreur est survenue.',
    body: "La page a rencontré une erreur inattendue. Essayez de rafraîchir — si le problème persiste, redémarrez le serveur.",
    retry: 'Réessayer',
    digest: 'digest :',
  },
  en: {
    title: 'Something broke.',
    body: 'The page hit an unexpected error. Try refreshing — if it persists, restart the server.',
    retry: 'Try again',
    digest: 'digest:',
  },
  ja: {
    title: 'エラーが発生しました。',
    body: 'ページで予期しないエラーが発生しました。更新してみてください。問題が続く場合はサーバーを再起動してください。',
    retry: '再試行',
    digest: 'ダイジェスト:',
  },
};

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
  // U-252: defaulting to 'fr' is wrong for EN/JA browsers that have
  // never set the locale cookie. Initial state stays 'fr' on the
  // server (SSR has no `navigator`); useEffect promotes to the
  // navigator language if the cookie is missing.
  const [lang, setLang] = useState<SupportedLocale>('en');

  useEffect(() => {
    console.error('Global error:', error);
    const fromCookie = readLocaleCookie();
    if (fromCookie) {
      setLang(fromCookie);
      return;
    }
    const fromNav = readLocaleFromNavigator();
    if (fromNav) setLang(fromNav);
  }, [error]);

  const s = STRINGS[lang];

  return (
    <html lang={lang}>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40, background: '#0b1220', color: '#fff' }}>
        <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {s.title}
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>
            {s.body}
          </p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginBottom: 16 }}>
              {s.digest} {error.digest}
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
            {s.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
