/**
 * R5-120 pin: every `/^v\d+$/` (and case-insensitive `/^v\d+$/i`)
 * inline regex test has been replaced with `isVndbVnId(...)` from
 * `@/lib/vn-id`. The strict variant is distinct from the existing
 * `isValidVnId` (which also accepts synthetic `egs_*` ids) so a
 * sweep can't widen the contract by accident.
 */
import { describe, expect, it } from 'vitest';
import { isVndbVnId, isValidVnId, VN_ID_RE, VNDB_VN_ID_RE } from '@/lib/vn-id-shape';
import { execSync } from 'node:child_process';

describe('isVndbVnId — R5-120 helper behaviour', () => {
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
  it('no inline regex test pattern remains under src/ (except the helper itself)', () => {
    let out = '';
    try {
      out = execSync(
        `grep -rnE '/\\^v\\\\d\\+\\$/i?\\.test\\(' src/`,
        { cwd: process.cwd(), encoding: 'utf8' },
      );
    } catch (e) {
      out = (e as { stdout?: string }).stdout ?? '';
    }
    // Only the helper modules themselves may reference the literal.
    const offenders = out
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((line) =>
        !line.startsWith('src/lib/vn-id.ts:') &&
        !line.startsWith('src/lib/vn-id-shape.ts:'),
      );
    expect(offenders).toEqual([]);
  });
});
