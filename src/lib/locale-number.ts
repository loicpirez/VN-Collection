import type { Locale } from './i18n/dictionaries';

/**
 * Canonical BCP-47 mapping for the locales supported by the i18n layer.
 * Exported so call sites stop duplicating the constant — see U-034 in
 * docs/audit-uiux-full.md.
 */
export const BCP47: Record<Locale, string> = {
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

/** Build a locale-aware currency formatter for repeated rendering. */
export function currencyFormatter(locale: Locale, currency = 'JPY'): Intl.NumberFormat {
  return new Intl.NumberFormat(BCP47[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

/** Format one currency value using the active application locale. */
export function formatCurrency(value: number, locale: Locale, currency = 'JPY'): string {
  return currencyFormatter(locale, currency).format(value);
}

/** Format a Date/timestamp with locale-appropriate representation. */
export function fmtDate(d: Date, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return d.toLocaleString(BCP47[locale], opts);
}

/**
 * Render a `Date` as the `YYYY-MM-DD` calendar day in the user's active
 * locale/zone, for storage fields the API validates as an ISO date.
 * Unlike `Date#toISOString().slice(0, 10)` this reads the day in the
 * locale's own time zone, so a "today" captured just before local
 * midnight no longer drifts a day forward into UTC.
 */
export function isoCalendarDay(date: Date, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(BCP47[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const dateParts: Intl.DateTimeFormatPartTypes[] = ['year', 'month', 'day'];
  return dateParts.map((type) => values.get(type)).join('-');
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

/**
 * Extract a year (4 digits) from a VNDB-shaped partial date.
 * Returns the year string for compact UI surfaces (cards, chips) that
 * deliberately only show the year — full date formatting belongs in
 * `formatVndbDateString`. Returns null when the input doesn't carry a
 * parseable year so the caller can omit the chip entirely.
 *
 * across the codebase; this helper centralises the parsing.
 */
export function yearOnly(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const match = /^(\d{4})/.exec(value);
  return match ? match[1] : null;
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
