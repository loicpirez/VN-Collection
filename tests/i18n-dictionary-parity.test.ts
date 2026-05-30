import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES } from '@/lib/i18n/dictionaries';

type Node = string | readonly Node[] | { readonly [key: string]: Node };

/**
 * Walk a dictionary tree and return every leaf key path (dot-joined) mapped
 * to its string value. Nested objects and arrays recurse; string leaves
 * terminate. Array elements use their index as the path segment.
 */
function collectLeaves(node: Node, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(prefix, node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      const path = prefix ? `${prefix}.${index}` : String(index);
      for (const [childPath, childValue] of collectLeaves(child, path)) {
        out.set(childPath, childValue);
      }
    });
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    for (const [childPath, childValue] of collectLeaves(value, path)) {
      out.set(childPath, childValue);
    }
  }
  return out;
}

/**
 * Extract the set of `{placeholder}` tokens from a translation string,
 * sorted for stable comparison across locales.
 */
function placeholders(value: string): string[] {
  const tokens = value.match(/\{[^}]+\}/g) ?? [];
  return [...new Set(tokens)].sort();
}

const leavesByLocale = new Map(
  LOCALES.map((locale) => [locale, collectLeaves(dictionaries[locale] as unknown as Node)] as const),
);

describe('i18n dictionary parity', () => {
  it('exposes the same locale set the test asserts over', () => {
    expect([...LOCALES].sort()).toEqual(['en', 'fr', 'ja']);
  });

  it('has the identical set of leaf key paths across fr/en/ja', () => {
    const fr = [...leavesByLocale.get('fr')!.keys()].sort();
    const en = [...leavesByLocale.get('en')!.keys()].sort();
    const ja = [...leavesByLocale.get('ja')!.keys()].sort();
    expect(fr.length).toBeGreaterThan(500);
    expect(en).toEqual(fr);
    expect(ja).toEqual(fr);
  });

  it('uses the identical set of {placeholder} tokens for every key across fr/en/ja', () => {
    const fr = leavesByLocale.get('fr')!;
    const en = leavesByLocale.get('en')!;
    const ja = leavesByLocale.get('ja')!;
    const mismatches: string[] = [];
    for (const [path, frValue] of fr) {
      const enValue = en.get(path);
      const jaValue = ja.get(path);
      if (enValue === undefined || jaValue === undefined) continue;
      const frTokens = placeholders(frValue);
      const enTokens = placeholders(enValue);
      const jaTokens = placeholders(jaValue);
      if (
        JSON.stringify(frTokens) !== JSON.stringify(enTokens) ||
        JSON.stringify(frTokens) !== JSON.stringify(jaTokens)
      ) {
        mismatches.push(
          `${path}: fr=${JSON.stringify(frTokens)} en=${JSON.stringify(enTokens)} ja=${JSON.stringify(jaTokens)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
