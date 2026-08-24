import { describe, expect, it } from 'vitest';
import { apiErrorBody, decodeApiErrorBody } from '@/lib/api-error-shape';

describe('api error shape', () => {
  it('builds canonical bodies with and without safe detail', () => {
    expect(apiErrorBody('failed', 'stable_code', 'route/read')).toEqual({
      ok: false,
      error: 'failed',
      code: 'stable_code',
      context: 'route/read',
    });
    expect(apiErrorBody('failed', 'stable_code', 'route/read', 'safe detail')).toEqual({
      ok: false,
      error: 'failed',
      code: 'stable_code',
      context: 'route/read',
      detail: 'safe detail',
    });
  });

  it('decodes canonical and legacy payloads into one normalized shape', () => {
    expect(decodeApiErrorBody({
      ok: false,
      error: 'failed',
      code: 'stable_code',
      context: 'route/read',
      detail: 'safe detail',
    })).toEqual({
      ok: false,
      error: 'failed',
      code: 'stable_code',
      context: 'route/read',
      detail: 'safe detail',
    });
    expect(decodeApiErrorBody({ error: 'legacy' })).toEqual({
      ok: false,
      error: 'legacy',
      code: null,
      context: null,
      detail: null,
    });
  });

  it('rejects invalid containers, discriminators, and error messages', () => {
    expect(decodeApiErrorBody(null)).toBeNull();
    expect(decodeApiErrorBody([])).toBeNull();
    expect(decodeApiErrorBody({ ok: true, error: 'not an error' })).toBeNull();
    expect(decodeApiErrorBody({ ok: 'false', error: 'not canonical' })).toBeNull();
    expect(decodeApiErrorBody({ error: '' })).toBeNull();
    expect(decodeApiErrorBody({ error: '   ' })).toBeNull();
    expect(decodeApiErrorBody({ error: 42 })).toBeNull();
  });

  it('normalizes malformed optional fields to null', () => {
    expect(decodeApiErrorBody({ error: 'failed', code: '', context: 42, detail: ' ' })).toEqual({
      ok: false,
      error: 'failed',
      code: null,
      context: null,
      detail: null,
    });
  });
});
