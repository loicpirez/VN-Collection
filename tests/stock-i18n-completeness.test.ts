import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES } from '@/lib/i18n/dictionaries';

/**
 * Every key under `stock.*` must be present in every locale. Type
 * widening via `Widen<>` covers nested shapes, but a few top-level
 * keys can drift across locales if added by hand. This test catches
 * missing or empty values.
 */
describe('stock i18n — completeness', () => {
  function flatten(obj: unknown, prefix = ''): string[] {
    if (!obj || typeof obj !== 'object') return [];
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out.push(...flatten(v, path));
      } else {
        out.push(path);
      }
    }
    return out;
  }

  it('every leaf key exists and is non-empty in every locale', () => {
    const reference = flatten(dictionaries.en.stock).sort();
    for (const locale of LOCALES) {
      const keys = flatten(dictionaries[locale].stock).sort();
      const missing = reference.filter((k) => !keys.includes(k));
      const extras = keys.filter((k) => !reference.includes(k));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
      expect({ locale, extras }).toEqual({ locale, extras: [] });
    }
  });

  it('mandatory diagnostic keys are localised for every locale', () => {
    const required = [
      'providerDiagnostics.blockedByShopMessage',
      'providerDiagnostics.unreachableBadge',
      'providerDiagnostics.unreachableMessage',
      'providerDiagnostics.yodobashiBlockedMessage',
      'providerDiagnostics.yodobashiUnreachableMessage',
      'providerDiagnostics.joshinUnreachableMessage',
      'providerDiagnostics.amiamiBlockedMessage',
      'providerDiagnostics.surugayaDetailsProtectedMessage',
      'providerDiagnostics.surugayaCachedProtectedMessage',
      'providerDiagnostics.protectedMessage',
      'providerDiagnostics.melonbooksMissingSourceMessage',
      'providerDiagnostics.wondergooUnsupportedMessage',
      'providerDiagnostics.parserErrorMessage',
      'providerDiagnostics.networkErrorMessage',
      'lastCheckedShort',
      'emptyHint',
      'groupBlockedRetry',
      'groupNotCheckedSelect',
    ];
    for (const locale of LOCALES) {
      const flatPath = (path: string): unknown => path.split('.').reduce<unknown>((acc, p) => {
        if (acc && typeof acc === 'object' && p in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[p];
        }
        return undefined;
      }, dictionaries[locale].stock);
      for (const key of required) {
        const value = flatPath(key);
        expect({ locale, key, value }).toMatchObject({ locale, key, value: expect.any(String) });
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('availability labels exist for every state', () => {
    for (const locale of LOCALES) {
      const av = dictionaries[locale].stock.availability;
      for (const key of ['in_stock', 'limited', 'out_of_stock', 'unknown', 'error'] as const) {
        expect({ locale, key, value: av[key] }).toMatchObject({ locale, key, value: expect.any(String) });
      }
    }
  });

  it('source labels exist for every source kind', () => {
    for (const locale of LOCALES) {
      const sl = dictionaries[locale].stock.sourceLabels;
      for (const key of ['direct', 'search', 'manual', 'cached'] as const) {
        expect({ locale, key, value: sl[key] }).toMatchObject({ locale, key, value: expect.any(String) });
      }
    }
  });

  it('match confidence labels exist for every level', () => {
    for (const locale of LOCALES) {
      const mc = dictionaries[locale].stock.matchConfidence;
      for (const key of ['exact', 'high', 'medium', 'low', 'reject'] as const) {
        expect({ locale, key, value: mc[key] }).toMatchObject({ locale, key, value: expect.any(String) });
      }
    }
  });

  it('not-counted reasons exist for every reason', () => {
    for (const locale of LOCALES) {
      const nc = dictionaries[locale].stock.notCountedReasons;
      for (const key of [
        'relatedMusic',
        'soundtrack',
        'relatedGoods',
        'weakMatch',
        'unrelatedTitle',
        'searchOnly',
        'outOfStock',
        'notEligible',
      ] as const) {
        expect({ locale, key, value: nc[key] }).toMatchObject({ locale, key, value: expect.any(String) });
      }
    }
  });
});
