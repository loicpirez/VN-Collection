/**
 * Pins the server-only `validateVnIdOr400` helper. The wrapper is
 * imported from every `/api/*` route that takes a VN id from the
 * dynamic path; a 400 from this helper is the contract that lets a
 * route fast-fail before any DB / network work.
 *
 * The validator returns `NextResponse | null` so callers can early-
 * return on the truthy result. We verify the shape of the failure
 * response (status 400, JSON body `{ error: 'invalid vn id' }`) and
 * the null-on-success path for both canonical VNDB ids and the
 * synthetic `egs_*` form.
 */
import { describe, expect, it } from 'vitest';
import { validateVnIdOr400 } from '@/lib/vn-id';

describe('validateVnIdOr400 — pass-through on valid ids', () => {
  it('returns null for a canonical `v\\d+` id', () => {
    expect(validateVnIdOr400('v90017')).toBe(null);
    expect(validateVnIdOr400('v17')).toBe(null);
  });

  it('returns null for a synthetic `egs_<num>` id', () => {
    expect(validateVnIdOr400('egs_9500001')).toBe(null);
    expect(validateVnIdOr400('egs_1')).toBe(null);
  });

  it('case-insensitive — uppercase canonical id still passes', () => {
    expect(validateVnIdOr400('V90017')).toBe(null);
  });
});

describe('validateVnIdOr400 — 400 response on invalid ids', () => {
  it('returns a 400 NextResponse for empty / null / undefined', async () => {
    const empty = validateVnIdOr400('');
    expect(empty).not.toBeNull();
    expect(empty!.status).toBe(400);
    const body = await empty!.json();
    expect(body).toEqual({ error: 'invalid vn id' });

    const nul = validateVnIdOr400(null);
    expect(nul!.status).toBe(400);

    const und = validateVnIdOr400(undefined);
    expect(und!.status).toBe(400);
  });

  it('rejects tag / producer / character / staff ids', async () => {
    for (const id of ['g123', 'p123', 'c123', 's123', 'r123', 'i123']) {
      const res = validateVnIdOr400(id);
      expect(res, `should reject "${id}"`).not.toBeNull();
      expect(res!.status).toBe(400);
    }
  });

  it('rejects garbage payloads — SQL-injection shapes', async () => {
    const offenders = [
      "v90017' OR '1'='1",
      'v90017;DROP TABLE vn',
      'v90017 OR 1=1',
      'V@90017',
      '  v90017',
      'v90017 ',
      '<script>',
    ];
    for (const id of offenders) {
      const res = validateVnIdOr400(id);
      expect(res, `should reject "${id}"`).not.toBeNull();
      expect(res!.status).toBe(400);
    }
  });

  it('rejects bare `v` / bare `egs_` without numeric suffix', () => {
    expect(validateVnIdOr400('v')!.status).toBe(400);
    expect(validateVnIdOr400('egs_')!.status).toBe(400);
    expect(validateVnIdOr400('v0a')!.status).toBe(400);
  });
});
