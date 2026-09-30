'use client';
import { useEffect, useId, useState, useTransition } from 'react';
import { Globe } from 'lucide-react';
import { setLocale } from '@/lib/i18n/actions';
import { LOCALES, type Locale } from '@/lib/i18n/dictionaries';
import { useLocale, useT } from '@/lib/i18n/client';

const LOCALE_AUTONYMS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  ja: '日本語',
};

export function LanguageSwitcher() {
  const t = useT();
  const current = useLocale();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(current);
  const [pending, startTransition] = useTransition();
  const hintId = useId();
  useEffect(() => {
    setSelectedLocale(current);
  }, [current]);
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted" aria-busy={pending || undefined}>
      <Globe className="h-4 w-4" aria-hidden />
      <label className="sr-only" htmlFor="locale-select">
        {t.nav.languageLabel}
      </label>
      <span id={hintId} className="sr-only">
        {t.nav.languageChangeHint}
      </span>
      <select
        id="locale-select"
        className="h-11 rounded-lg border border-border bg-bg-card px-2 py-1 text-sm text-white outline-none focus:border-accent disabled:opacity-50"
        value={selectedLocale}
        disabled={pending}
        aria-describedby={hintId}
        onChange={(e) => {
          const v = e.target.value as Locale;
          setSelectedLocale(v);
          startTransition(async () => {
            try {
              await setLocale(v);
            } catch {
              setSelectedLocale(current);
            }
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_AUTONYMS[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
