/**
 * Mirror of `upstream-error-helper.test.ts` for the 500 path.
 *
 * `internalError(route, err)` is the canonical catch-block helper for
 * unexpected DB / runtime failures inside an `/api/*` route. It must:
 *   - Return `NextResponse.json({ error: 'internal error' }, 500)`.
 *   - Log the raw detail (with route label) to `console.error` so the
 *     operator can still diagnose locally.
 *   - Never echo the raw message to the client (defence-in-depth
 *     against SQLite / driver error strings that may carry table /
 *     schema info).
 *
 * No production code surface should ever surface `(err as Error).message`
 * in a 500 response body anymore — `internalError` is the only path.
 */
import { describe, expect, it, vi } from 'vitest';
import { internalError } from '@/lib/api-error';

describe('internalError — behaviour', () => {
  it('returns a 500 with the generic body', async () => {
    const res = internalError('test-route', new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'internal error' });
  });

  it('logs the detail to console.error with the route label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      internalError('reading-queue', new Error('SQLITE_BUSY: database is locked'));
      expect(spy).toHaveBeenCalledWith(
        '[internal:reading-queue] SQLITE_BUSY: database is locked',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('handles non-Error throwables — string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = internalError('rt', 'string-thrown');
      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledWith('[internal:rt] string-thrown');
    } finally {
      spy.mockRestore();
    }
  });

  it('handles non-Error throwables — null/undefined', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res1 = internalError('rt', null);
      expect(res1.status).toBe(500);
      const res2 = internalError('rt', undefined);
      expect(res2.status).toBe(500);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('never echoes the upstream / DB message in the JSON body', async () => {
    // Defence-in-depth: even when the route label is itself an error
    // string, the response body remains the canonical literal so we
    // never accidentally surface schema names or SQL fragments to
    // the client.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const dangerous = new Error('table "credentials" not found: SELECT token FROM …');
      const res = internalError('safe-route', dangerous);
      const body = await res.json();
      expect(body.error).toBe('internal error');
      // The raw SQL fragment must NOT appear in the body — even as a
      // wrapped substring.
      const json = JSON.stringify(body);
      expect(json).not.toContain('credentials');
      expect(json).not.toContain('token');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns a NextResponse — every getter is intact', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = internalError('rt', new Error('boom'));
      // NextResponse retains the standard Response surface.
      expect(typeof res.status).toBe('number');
      expect(typeof res.headers.get).toBe('function');
      expect(res.headers.get('content-type')).toMatch(/application\/json/i);
    } finally {
      spy.mockRestore();
    }
  });
});
