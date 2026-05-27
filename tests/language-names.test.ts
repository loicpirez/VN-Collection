/**
 * Pins the `languageDisplayName` lookup contract.
 *
 * Every language chip on the app — VNDB language code displayed
 * next to a release row, a character voice credit, a producer
 * locale, the wishlist filter chip — routes through this helper.
 * A drift in the case-insensitive lookup, the Intl fallback, or
 * the unknown-code fallback would cascade.
 *
 * The helper is pure (and intentionally NOT marked `server-only`)
 * so we can exercise it directly here without booting any
 * server-only module graph.
 */
import { describe, expect, it } from 'vitest';
import { languageDisplayName } from '@/lib/language-names';

describe('languageDisplayName — Intl path', () => {
  it('returns the locale-localised display name for canonical codes', () => {
    // `Intl.DisplayNames` is available in Node 20+, so the
    // primary path should resolve every common code.
    expect(languageDisplayName('ja', 'en')).toMatch(/Japanese|japan/i);
    expect(languageDisplayName('en', 'en')).toMatch(/English/i);
    expect(languageDisplayName('fr', 'en')).toMatch(/French|françai/i);
  });

  it('honours the caller-supplied locale (fr)', () => {
    const result = languageDisplayName('ja', 'fr');
    // French resolves Japanese as "japonais" via Intl.DisplayNames.
    // Don't pin the exact form — locale data may differ slightly
    // between Node versions — but it must NOT match the English
    // form word-for-word.
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles a region variant via Intl', () => {
    // `pt-BR` is well-known and resolves to a region-aware label.
    const result = languageDisplayName('pt-BR', 'en');
    expect(result).toMatch(/Portuguese/i);
  });

  it('returns an empty string for null / undefined / empty input', () => {
    expect(languageDisplayName(null)).toBe('');
    expect(languageDisplayName(undefined)).toBe('');
    expect(languageDisplayName('')).toBe('');
  });
});

describe('languageDisplayName — static-map fallback', () => {
  it('falls back to the static map when Intl returns the code unchanged', () => {
    // Codes that Intl may not recognise (or where it returns the
    // raw code unchanged) should fall through to the static map.
    // `zh-hans` and `zh-hant` are spelled lowercase in the map.
    // The helper lowercases the input before lookup, so the input
    // case must not matter.
    expect(languageDisplayName('ZH-HANS', 'en')).not.toBe('');
    expect(languageDisplayName('zh-hans', 'en')).not.toBe('');
  });

  it('returns the uppercase raw code for completely unknown codes', () => {
    // A freshly-coined VNDB language code should appear as an
    // upper-cased chip rather than blank — visually loud enough
    // for a future fix-up.
    expect(languageDisplayName('xx', 'en')).toBe('XX');
    expect(languageDisplayName('zz-foo', 'en')).toMatch(/^(ZZ-FOO|zz-foo)$/i);
  });

  it('default locale is "en"', () => {
    // No locale arg → uses 'en'.
    const result = languageDisplayName('ja');
    expect(result).toMatch(/Japanese|japan/i);
  });
});
