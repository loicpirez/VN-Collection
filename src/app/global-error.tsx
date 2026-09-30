'use client';

import { useEffect, useState } from 'react';

const VALID_LOCALES = ['fr', 'en', 'ja'] as const;
type SupportedLocale = typeof VALID_LOCALES[number];

function readLocaleCookie(): SupportedLocale | null {
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const loc = match?.[1];
  return loc && (VALID_LOCALES as readonly string[]).includes(loc) ? (loc as SupportedLocale) : null;
}

/**
 * U-252: when no `locale` cookie has been set yet (fresh install, or
 * the user has never opened the language switcher), fall back to the
 * navigator's preferred language instead of defaulting to French.
 * This is the only locale-resolution path in the entire app that
 * runs WITHOUT the I18nProvider - so we have to do the matching
 * ourselves.
 */
function readLocaleFromNavigator(): SupportedLocale | null {
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
    body: "La page a rencontré une erreur inattendue. Essayez de rafraîchir - si le problème persiste, redémarrez le serveur.",
    retry: 'Réessayer',
    digest: 'digest :',
  },
  en: {
    title: 'Something broke.',
    body: 'The page hit an unexpected error. Try refreshing - if it persists, restart the server.',
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

function useErrorLocale(error: Error): SupportedLocale {
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
  return lang;
}

function ErrorContent({
  error,
  lang,
  reset,
}: {
  error: Error & { digest?: string };
  lang: SupportedLocale;
  reset: () => void;
}) {
  const s = STRINGS[lang];
  return (
    <div
      role="alert"
      data-global-error-content
      lang={lang}
      style={{ width: '100%', maxWidth: 480, margin: 'clamp(24px, 8vh, 60px) auto', textAlign: 'center' }}
    >
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
              minHeight: 44,
            }}
          >
            {s.retry}
          </button>
    </div>
  );
}

/** Render the interactive, localized content shared by the global boundary and QA probe. */
export function GlobalErrorContent(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = useErrorLocale(props.error);
  return <ErrorContent {...props} lang={lang} />;
}

/** Render the top-level Next.js error boundary document with its own responsive shell. */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = useErrorLocale(props.error);
  return (
    <html lang={lang}>
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          padding: 'clamp(16px, 5vw, 40px)',
          background: '#0b1220',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <ErrorContent {...props} lang={lang} />
      </body>
    </html>
  );
}
