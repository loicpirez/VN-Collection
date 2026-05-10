'use client';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { setLocale } from '@/lib/i18n/actions';
import { LOCALES, type Locale } from '@/lib/i18n/dictionaries';
import { useLocale, useT } from '@/lib/i18n/client';

export function LanguageSwitcher() {
  const t = useT();
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted">
      <Globe className="h-4 w-4" aria-hidden />
      <label className="sr-only" htmlFor="locale-select">
        {t.nav.languageLabel}
      </label>
      <select
        id="locale-select"
        className="rounded-lg border border-border bg-bg-card px-2 py-1 text-sm text-white outline-none focus:border-accent disabled:opacity-50"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as Locale;
          startTransition(() => {
            setLocale(v);
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
