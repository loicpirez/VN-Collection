import type { Locale } from './i18n/dictionaries';

const BCP47: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  ja: 'ja-JP',
};

/** Format a number using locale-appropriate thousands separators. */
export function fmtNum(n: number, locale: Locale, fractionDigits?: number): string {
  return n.toLocaleString(BCP47[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Format a Date/timestamp with locale-appropriate representation. */
export function fmtDate(d: Date, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return d.toLocaleString(BCP47[locale], opts);
}
