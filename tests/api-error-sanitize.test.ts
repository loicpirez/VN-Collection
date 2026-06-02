/**
 * Pins the `sanitizeErrorMessage(unknown)` / `loggedApiError` contract:
 *   - proxy-credential URLs are stripped of their userinfo;
 *   - remaining URLs collapse to scheme + host (path + query dropped);
 *   - Bearer / token / apikey credentials are redacted;
 *   - absolute filesystem paths are replaced;
 *   - stack-frame tails are removed;
 *   - `loggedApiError` logs the full value server-side and returns only
 *     the sanitized `{ error }` body.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loggedApiError, sanitizeErrorMessage } from '@/lib/api-error-sanitize';

describe('sanitizeErrorMessage', () => {
  it('strips userinfo from a proxy URL with credentials', () => {
    const out = sanitizeErrorMessage(
      new Error('connect failed http://alice:s3cret@proxy.example.com:1080/x'),
    );
    expect(out).not.toContain('alice');
    expect(out).not.toContain('s3cret');
  });

  it('reduces a plain URL to scheme + host (drops path and query)', () => {
    const out = sanitizeErrorMessage(
      new Error('GET https://api.vndb.org/kana/vn?token=abc&q=secret returned 500'),
    );
    expect(out).toContain('https://api.vndb.org');
    expect(out).not.toContain('/kana/vn');
    expect(out).not.toContain('q=secret');
    expect(out).not.toContain('token=abc');
  });

  it('replaces malformed URL runs with a placeholder', () => {
    expect(sanitizeErrorMessage('GET http://% failed')).toBe('GET [url] failed');
  });

  it('redacts a Bearer token', () => {
    const out = sanitizeErrorMessage(new Error('auth rejected: Bearer abc123def456ghi789'));
    expect(out).toContain('[REDACTED_TOKEN]');
    expect(out).not.toContain('abc123def456ghi789');
  });

  it('redacts an apikey= credential', () => {
    const out = sanitizeErrorMessage('upstream said apikey=DEADBEEFCAFEBABE0123456789abcdef');
    expect(out).not.toContain('DEADBEEFCAFEBABE0123456789abcdef');
    expect(out).toContain('[REDACTED_TOKEN]');
  });

  it('replaces an absolute POSIX file path', () => {
    const out = sanitizeErrorMessage(
      new Error("ENOENT: no such file '/Users/op/app/data/collection.db'"),
    );
    expect(out).toContain('[path]');
    expect(out).not.toContain('/Users/op/app/data/collection.db');
  });

  it('replaces an absolute Windows file path', () => {
    const out = sanitizeErrorMessage(new Error('cannot open C:\\Users\\op\\data\\db.sqlite'));
    expect(out).toContain('[path]');
    expect(out).not.toContain('C:\\Users\\op\\data\\db.sqlite');
  });

  it('drops the stack-frame tail', () => {
    const out = sanitizeErrorMessage('boom at Object.<anonymous> (server.js:10:5)');
    expect(out).toBe('boom');
  });

  it('returns "unknown error" for a bare object', () => {
    expect(sanitizeErrorMessage({})).toBe('unknown error');
  });

  it('keeps a short safe message intact', () => {
    expect(sanitizeErrorMessage(new Error('not in collection'))).toBe('not in collection');
  });
});

describe('loggedApiError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the full error with context and returns the sanitized body', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = new Error('proxy failed at http://u:p@h.example.com:1080/secret');
    const body = loggedApiError(e, 'steam-sync');

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain('[steam-sync]');
    expect(logged).toContain('p@h.example.com');

    expect(body.error).not.toContain('u:p@h.example.com');
    expect(body.error).not.toContain('/secret');
  });

  it('stringifies a non-Error value for the log line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = loggedApiError('plain failure', 'ctx');
    expect(String(spy.mock.calls[0][0])).toContain('plain failure');
    expect(body.error).toBe('plain failure');
  });

  it('falls back to the message when an Error has no stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('stackless failure');
    Object.defineProperty(error, 'stack', { value: undefined });
    loggedApiError(error, 'ctx');
    expect(String(spy.mock.calls[0][0])).toContain('stackless failure');
  });
});
