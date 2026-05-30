/**
 * R5-SEC-006 in-memory rate limiter and its route-facing wrapper.
 *
 * `rateLimit` is driven with an injected `now` so window boundaries are
 * exact without real timers. Each case uses a distinct key so the
 * module-level Map cannot leak state between cases. `tooManyRequests` is
 * exercised for the 429 body and the `Retry-After` header it derives.
 */
import { describe, expect, it } from 'vitest';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { tooManyRequests } from '@/lib/rate-limit-response';

const OPTS = { limit: 3, windowMs: 1000 };

describe('rateLimit fixed-window counter', () => {
  it('allows up to `limit` requests inside one window', () => {
    expect(rateLimit('allow', { ...OPTS, now: 0 }).ok).toBe(true);
    expect(rateLimit('allow', { ...OPTS, now: 100 }).ok).toBe(true);
    expect(rateLimit('allow', { ...OPTS, now: 200 }).ok).toBe(true);
  });

  it('blocks the request past the limit and reports retryAfterMs to window end', () => {
    rateLimit('block', { ...OPTS, now: 0 });
    rateLimit('block', { ...OPTS, now: 100 });
    rateLimit('block', { ...OPTS, now: 200 });
    const fourth = rateLimit('block', { ...OPTS, now: 300 });
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterMs).toBe(700);
  });

  it('does not extend the window when a flood keeps hitting a blocked key', () => {
    for (const now of [0, 10, 20]) rateLimit('flood', { ...OPTS, now });
    const blocked = rateLimit('flood', { ...OPTS, now: 500 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(500);
    const stillBlocked = rateLimit('flood', { ...OPTS, now: 900 });
    expect(stillBlocked.ok).toBe(false);
    expect(stillBlocked.retryAfterMs).toBe(100);
  });

  it('opens a fresh window once windowMs has fully elapsed', () => {
    for (const now of [0, 1, 2]) rateLimit('reset', { ...OPTS, now });
    expect(rateLimit('reset', { ...OPTS, now: 999 }).ok).toBe(false);
    expect(rateLimit('reset', { ...OPTS, now: 1000 }).ok).toBe(true);
    expect(rateLimit('reset', { ...OPTS, now: 1100 }).ok).toBe(true);
  });

  it('tracks distinct keys independently', () => {
    for (const now of [0, 1, 2]) rateLimit('iso-a', { ...OPTS, now });
    expect(rateLimit('iso-a', { ...OPTS, now: 3 }).ok).toBe(false);
    expect(rateLimit('iso-b', { ...OPTS, now: 3 }).ok).toBe(true);
  });
});

describe('clientIp keying helper', () => {
  it('uses the first x-forwarded-for hop when present', () => {
    const req = new Request('http://example.test/api/search', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to the URL host when no forwarded header is set', () => {
    const req = new Request('http://127.0.0.1/api/search');
    expect(clientIp(req)).toBe('127.0.0.1');
  });
});

describe('tooManyRequests route wrapper', () => {
  const req = (ip: string): Request =>
    new Request('http://host.test/api/x', { headers: { 'x-forwarded-for': ip } });

  it('returns null while within budget', () => {
    expect(tooManyRequests(req('198.51.100.1'), 'wrap-ok', { limit: 2, windowMs: 1000, now: 0 })).toBeNull();
    expect(tooManyRequests(req('198.51.100.1'), 'wrap-ok', { limit: 2, windowMs: 1000, now: 10 })).toBeNull();
  });

  it('returns a 429 with the shared body and a rounded-up Retry-After once over budget', async () => {
    tooManyRequests(req('198.51.100.2'), 'wrap-429', { limit: 1, windowMs: 5000, now: 0 });
    const res = tooManyRequests(req('198.51.100.2'), 'wrap-429', { limit: 1, windowMs: 5000, now: 1500 });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('4');
    const body = (await res!.json()) as { error: string };
    expect(body.error).toBe('rate limit exceeded');
  });

  it('keys on route + ip so different routes from one ip do not share a budget', () => {
    tooManyRequests(req('198.51.100.3'), 'wrap-r1', { limit: 1, windowMs: 1000, now: 0 });
    const sameRoute = tooManyRequests(req('198.51.100.3'), 'wrap-r1', { limit: 1, windowMs: 1000, now: 1 });
    expect(sameRoute).not.toBeNull();
    const otherRoute = tooManyRequests(req('198.51.100.3'), 'wrap-r2', { limit: 1, windowMs: 1000, now: 1 });
    expect(otherRoute).toBeNull();
  });
});
