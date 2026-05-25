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

/** Format a VNDB partial date without inventing missing precision. */
export function formatVndbDateString(raw: string | null | undefined, locale: Locale): string {
  const value = raw?.trim();
  if (!value) return '—';
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  if (!month) return String(year);
  const date = new Date(Date.UTC(year, month - 1, day ?? 1));
  if (!day) {
    return new Intl.DateTimeFormat(BCP47[locale], {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  return new Intl.DateTimeFormat(BCP47[locale], {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

/** Format an ISO calendar date from local user data without timezone drift. */
export function formatIsoDateString(raw: string | null | undefined, locale: Locale): string {
  const value = raw?.trim();
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(BCP47[locale], {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}
