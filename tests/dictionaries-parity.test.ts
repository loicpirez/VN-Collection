/**
 * Locale parity check: every key in `dictionaries.fr` must also exist
 * in `dictionaries.en` and `dictionaries.ja`. Catches the recurring
 * footgun where a new feature ships with a French key but the EN /
 * JA paths fall through to `undefined` at runtime — TypeScript's
 * `Widen<>` helper already covers the shape, but only if all three
 * objects are declared with the same set of keys; missing keys still
 * pass `tsc` as long as the value type stays compatible.
 *
 * This test asserts deep key parity (string-keys only, nested objects
 * walked recursively) without locking any specific copy.
 */
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';

type Tree = { [k: string]: string | Tree | string[] };

function collectKeyPaths(node: unknown, prefix = ''): string[] {
  if (node == null) return [];
  if (typeof node !== 'object') return [];
  if (Array.isArray(node)) return [];
  const paths: string[] = [];
  for (const [k, v] of Object.entries(node as Tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    paths.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      paths.push(...collectKeyPaths(v, path));
    }
  }
  return paths;
}

describe('i18n dictionaries parity', () => {
  const frKeys = new Set(collectKeyPaths(dictionaries.fr));
  const enKeys = new Set(collectKeyPaths(dictionaries.en));
  const jaKeys = new Set(collectKeyPaths(dictionaries.ja));

  it('English has every French key', () => {
    const missing = [...frKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('Japanese has every French key', () => {
    const missing = [...frKeys].filter((k) => !jaKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('French has every English key (catches the reverse drift)', () => {
    const missing = [...enKeys].filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('French has every Japanese key', () => {
    const missing = [...jaKeys].filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });
});
