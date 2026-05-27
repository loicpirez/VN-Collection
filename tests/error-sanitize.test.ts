/**
 * Pins the `sanitizeErrorMessage` / `sanitizeUnknownError` contract:
 *   - URLs with embedded userinfo are redacted (proxy credentials).
 *   - Long opaque alphanumeric runs are redacted (API keys).
 *   - CR/LF stripped (log injection defence).
 *   - Capped at 500 chars by default.
 *
 * These helpers underpin the public-facing `error`/`detail` fields on
 * every route that surfaces upstream failure info to the UI.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage, sanitizeUnknownError } from '@/lib/error-sanitize';

describe('sanitizeErrorMessage', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(sanitizeErrorMessage(null)).toBe('');
    expect(sanitizeErrorMessage(undefined)).toBe('');
    expect(sanitizeErrorMessage('')).toBe('');
  });

  it('redacts userinfo-bearing URLs (proxy credentials)', () => {
    expect(sanitizeErrorMessage('connect ETIMEDOUT http://user:pw@proxy.example.com:1080/')).toBe(
      'connect ETIMEDOUT [REDACTED_URL]',
    );
    expect(sanitizeErrorMessage('agent: socks5h://alice:s3cret@jp.proxy.net:1080')).toBe(
      'agent: [REDACTED_URL]',
    );
  });

  it('does NOT redact userinfo-less URLs (they carry no secrets)', () => {
    const out = sanitizeErrorMessage('GET https://www.suruga-ya.jp/search returned 403');
    expect(out).toContain('https://www.suruga-ya.jp/search');
  });

  it('redacts long opaque alphanumeric runs (API keys)', () => {
    const out = sanitizeErrorMessage('steam api rejected key ABCDEF0123456789abcdef0123456789xx as invalid');
    expect(out).toContain('[REDACTED_TOKEN]');
    expect(out).not.toContain('ABCDEF0123456789abcdef0123456789xx');
  });

  it('keeps short identifiers (under 32 chars)', () => {
    expect(sanitizeErrorMessage('rejected key shortone')).toBe('rejected key shortone');
  });

  it('strips CR/LF (log injection defence)', () => {
    expect(sanitizeErrorMessage('first\r\nfake log line: pwned')).toBe('first fake log line: pwned');
  });

  it('respects the maxLen cap', () => {
    // Use a non-token-shaped input (spaces every few chars) so the
    // token-redaction pass doesn't collapse the long string before the
    // slice; that would defeat the test's intent.
    const long = ('error '.repeat(400));
    expect(sanitizeErrorMessage(long).length).toBe(500);
    expect(sanitizeErrorMessage(long, 100).length).toBe(100);
  });
});

describe('sanitizeUnknownError', () => {
  it('extracts message from an Error instance', () => {
    expect(sanitizeUnknownError(new Error('boom'))).toBe('boom');
  });

  it('returns the string as-is when given a string', () => {
    expect(sanitizeUnknownError('plain string')).toBe('plain string');
  });

  it('returns "unknown error" for plain objects (avoids "[object Object]")', () => {
    expect(sanitizeUnknownError({})).toBe('unknown error');
    expect(sanitizeUnknownError({ foo: 'bar' })).toBe('unknown error');
  });

  it('falls through the sanitizer pipeline (URL + token redaction)', () => {
    const e = new Error('proxy failed at http://u:p@h.example.com:1080/ with key ABCDEF0123456789abcdef0123456789xx');
    const out = sanitizeUnknownError(e);
    expect(out).toContain('[REDACTED_URL]');
    expect(out).toContain('[REDACTED_TOKEN]');
  });
});
