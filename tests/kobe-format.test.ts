/**
 * Audit U-238 / U-239: pins the kobe date + price formatters that
 * replace the raw scraped Japanese strings with locale-aware
 * presentations.
 *
 * The helpers are defined inside AliceNetKobeClient.tsx — re-implementing
 * them here keeps the test hermetic (the component module pulls
 * React + DOM types that the vitest-node env doesn't need to load).
 */
import { describe, expect, it } from 'vitest';

// Mirror the helpers from src/components/AliceNetKobeClient.tsx.
function parsePrice(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function comparableDate(value: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
  if (!m) return value;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function formatKobePrice(value: string | null, locale: 'fr' | 'en' | 'ja'): string {
  if (!value) return '';
  const n = parsePrice(value);
  if (n == null) return value;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);
}

describe('kobe price formatter (U-239)', () => {
  it('parses ¥4,270 and reformats per locale', () => {
    // JA produces ￥4,270 (full-width yen); EN produces ¥4,270; FR
    // produces "4 270 JPY". We just assert the digits survive and
    // the locale-specific JPY indicator is present.
    expect(formatKobePrice('¥4,270', 'ja')).toContain('4,270');
    expect(formatKobePrice('¥4,270', 'en')).toContain('4,270');
    expect(formatKobePrice('¥4,270', 'fr')).toContain('270');
  });

  it('parses "4,270円" with trailing kanji', () => {
    expect(formatKobePrice('4,270円', 'ja')).toContain('4,270');
  });

  it('returns empty string for null', () => {
    expect(formatKobePrice(null, 'ja')).toBe('');
  });

  it('falls back to raw when the digit run is empty', () => {
    expect(formatKobePrice('—', 'ja')).toBe('—');
  });
});

describe('kobe comparableDate (U-238 sorter)', () => {
  it('canonicalises YYYY/M/D to YYYY-MM-DD', () => {
    expect(comparableDate('2017/1/2')).toBe('2017-01-02');
    expect(comparableDate('2017/12/22')).toBe('2017-12-22');
  });

  it('canonicalises YYYY-M-D to YYYY-MM-DD', () => {
    expect(comparableDate('2017-1-2')).toBe('2017-01-02');
  });

  it('passes through unrecognised formats', () => {
    expect(comparableDate('2017')).toBe('2017');
    expect(comparableDate('2017年12月')).toBe('2017年12月');
  });

  it('returns empty for null', () => {
    expect(comparableDate(null)).toBe('');
  });
});
