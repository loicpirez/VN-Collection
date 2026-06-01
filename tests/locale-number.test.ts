import { describe, expect, it } from 'vitest';
import { currencyFormatter, fmtDate, fmtNum, formatCurrency, formatIsoDateString, formatVndbDateString, yearOnly } from '@/lib/locale-number';

describe('locale date formatting', () => {
  it('formats VNDB partial dates without inventing missing precision', () => {
    expect(formatVndbDateString('2020', 'en')).toBe('2020');
    expect(formatVndbDateString('2020-05', 'en')).toBe('May 2020');
    expect(formatVndbDateString('2020-05-21', 'en')).toBe('May 21, 2020');
  });

  it('formats the same full date differently by locale without timezone drift', () => {
    expect(formatIsoDateString('2020-05-21', 'fr')).toContain('2020');
    expect(formatIsoDateString('2020-05-21', 'ja')).toContain('2020');
    expect(formatIsoDateString('2020-05-21', 'en')).toBe('May 21, 2020');
  });

  it('formats numbers with locale-specific separators', () => {
    expect(fmtNum(1234567.5, 'en', 1)).toBe('1,234,567.5');
    expect(fmtNum(1234567.5, 'fr', 1)).toContain('1');
    expect(fmtNum(1234567.5, 'ja', 1)).toBe('1,234,567.5');
  });

  it('formats currency with the active locale', () => {
    expect(formatCurrency(1234, 'en')).toContain('1,234');
    expect(formatCurrency(1234, 'ja')).toContain('1,234');
    expect(currencyFormatter('fr').format(1234)).toContain('1');
  });

  it('formats timestamps using the requested locale', () => {
    const date = new Date(Date.UTC(2020, 4, 21, 12, 30));
    const opts = { dateStyle: 'medium', timeZone: 'UTC' } satisfies Intl.DateTimeFormatOptions;
    expect(fmtDate(date, 'en', opts)).toBe('May 21, 2020');
    expect(fmtDate(date, 'fr', opts)).toContain('2020');
    expect(fmtDate(date, 'ja', opts)).toContain('2020');
  });
});

describe('yearOnly', () => {
  it('strips a partial VNDB date down to the year', () => {
    expect(yearOnly('2020')).toBe('2020');
    expect(yearOnly('2020-05')).toBe('2020');
    expect(yearOnly('2020-05-21')).toBe('2020');
  });

  it('returns null for null/undefined/empty/whitespace input', () => {
    expect(yearOnly(null)).toBeNull();
    expect(yearOnly(undefined)).toBeNull();
    expect(yearOnly('')).toBeNull();
    expect(yearOnly('   ')).toBeNull();
  });

  it('returns null when the leading four chars are not digits', () => {
    expect(yearOnly('TBA')).toBeNull();
    expect(yearOnly('not-a-date')).toBeNull();
    expect(yearOnly('20--')).toBeNull();
  });
});
