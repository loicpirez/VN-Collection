/**
 * R5-120 pin: every `/^v\d+$/` (and case-insensitive `/^v\d+$/i`)
 * inline regex test has been replaced with `isVndbVnId(...)` from
 * `@/lib/vn-id-shape`. The strict variant is distinct from the
 * existing `isValidVnId` (which also accepts synthetic `egs_*`
 * ids) so a sweep can't widen the contract by accident.
 */
import { describe, expect, it } from 'vitest';
import { isVndbVnId, isValidVnId, VN_ID_RE, VNDB_VN_ID_RE } from '@/lib/vn-id-shape';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkSrc(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkSrc(p);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry)) yield p;
  }
}

const INLINE_VN_ID_RE_TEST = /\/\^v\\d\+\$\/i?\.test\(/;

describe('isVndbVnIdhelper behaviour', () => {
  it('accepts canonical v\\d+ ids', () => {
    expect(isVndbVnId('v17')).toBe(true);
    expect(isVndbVnId('V17')).toBe(true);
    expect(isVndbVnId('v90000')).toBe(true);
  });

  it('rejects synthetic egs_* ids (use isValidVnId for that)', () => {
    expect(isVndbVnId('egs_12345')).toBe(false);
    expect(isValidVnId('egs_12345')).toBe(true);
  });

  it('rejects garbage / empty / non-string', () => {
    expect(isVndbVnId('v')).toBe(false);
    expect(isVndbVnId('v1a')).toBe(false);
    expect(isVndbVnId(' v17')).toBe(false);
    expect(isVndbVnId('')).toBe(false);
    expect(isVndbVnId(null)).toBe(false);
    expect(isVndbVnId(undefined)).toBe(false);
  });

  it('VNDB_VN_ID_RE pattern is exposed for non-helper callers', () => {
    expect(VNDB_VN_ID_RE.test('v17')).toBe(true);
    expect(VN_ID_RE.test('egs_12345')).toBe(true);
    expect(VNDB_VN_ID_RE.test('egs_12345')).toBe(false);
  });
});

describe('R5-120 sweep — no inline `/^v\\d+$/.test(...)` survives', () => {
  it('no inline regex test pattern remains under src/ (except the helper modules)', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const rel = path.slice(ROOT.length + 1);
      // The helper modules themselves are allowed to reference
      // the literal (that's where the regex lives).
      if (rel === 'src/lib/vn-id.ts' || rel === 'src/lib/vn-id-shape.ts') continue;
      const src = readFileSync(path, 'utf8');
      if (INLINE_VN_ID_RE_TEST.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
