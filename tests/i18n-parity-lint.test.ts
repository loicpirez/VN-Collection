import { describe, expect, it } from 'vitest';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';

type Path = string;

function walk(obj: unknown, prefix: Path = ''): Map<Path, string> {
  const out = new Map<Path, string>();
  if (obj == null) return out;
  if (typeof obj === 'string') {
    out.set(prefix, obj);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      for (const [k, s] of walk(v, `${prefix}[${i}]`)) out.set(k, s);
    });
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      for (const [p, s] of walk(v, path)) out.set(p, s);
    }
  }
  return out;
}

function extractPlaceholders(s: string): string[] {
  const out: string[] = [];
  const re = /\{([a-zA-Z_][\w-]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out.sort();
}

describe('i18n dictionary parity', () => {
  const locales: Locale[] = ['fr', 'en', 'ja'];
  const flat = new Map<Locale, Map<Path, string>>();
  for (const loc of locales) {
    flat.set(loc, walk(dictionaries[loc]));
  }
  const frKeys = flat.get('fr')!;

  it('every FR key has matching EN + JA entries', () => {
    const missing: string[] = [];
    for (const key of frKeys.keys()) {
      if (!flat.get('en')!.has(key)) missing.push(`en is missing ${key}`);
      if (!flat.get('ja')!.has(key)) missing.push(`ja is missing ${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('every EN key has matching FR + JA entries (catches stale-EN-only keys)', () => {
    const enKeys = flat.get('en')!;
    const missing: string[] = [];
    for (const key of enKeys.keys()) {
      if (!frKeys.has(key)) missing.push(`fr is missing ${key}`);
      if (!flat.get('ja')!.has(key)) missing.push(`ja is missing ${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('placeholders ({n}, {name}, …) match across every locale', () => {
    const mismatches: string[] = [];
    for (const [key, frStr] of frKeys) {
      const frPh = extractPlaceholders(frStr);
      if (frPh.length === 0) continue;
      for (const loc of ['en', 'ja'] as const) {
        const otherStr = flat.get(loc)!.get(key);
        if (typeof otherStr !== 'string') continue;
        const otherPh = extractPlaceholders(otherStr);
        if (JSON.stringify(frPh) !== JSON.stringify(otherPh)) {
          mismatches.push(`${key}: fr=[${frPh.join(',')}] ${loc}=[${otherPh.join(',')}]`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('no empty-string leaf values (placeholder content slipped through)', () => {
    const empties: string[] = [];
    for (const loc of locales) {
      for (const [key, val] of flat.get(loc)!) {
        if (val === '' || val === 'TODO' || val === 'FIXME') {
          empties.push(`${loc}.${key} = "${val}"`);
        }
      }
    }
    expect(empties).toEqual([]);
  });
});
