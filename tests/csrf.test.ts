import { describe, expect, it } from 'vitest';
import { csrfGuard } from '@/lib/csrf';

/**
 * The CSRF gate is the only thing standing between a malicious
 * cross-origin `<form>` and a state-mutating API route. Every branch
 * here matters; the audit specifically called out the `same-site`
 * (kept too permissive on multi-subdomain deployments) and `Origin:
 * null` (browser-extension / sandboxed-iframe POSTs) policies as
 * load-bearing. This test pins both decisions.
 */

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/anything', {
    method,
    headers,
  });
}

describe('csrfGuard', () => {
  it('lets safe methods through without inspection', () => {
    expect(csrfGuard(req('GET'))).toBeNull();
    expect(csrfGuard(req('HEAD'))).toBeNull();
    expect(csrfGuard(req('OPTIONS'))).toBeNull();
  });

  it('rejects form-encoded bodies on state-mutating methods (415)', async () => {
    const resp = csrfGuard(req('POST', { 'content-type': 'application/x-www-form-urlencoded' }));
    expect(resp).not.toBeNull();
    expect(resp?.status).toBe(415);
  });

  it('rejects text/plain bodies (CSRF surface) with 415', () => {
    const resp = csrfGuard(req('POST', { 'content-type': 'text/plain' }));
    expect(resp?.status).toBe(415);
  });

  it('accepts same-origin Sec-Fetch-Site', () => {
    expect(
      csrfGuard(
        req('POST', {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBeNull();
  });

  it('accepts `none` Sec-Fetch-Site (address-bar navigation)', () => {
    expect(
      csrfGuard(
        req('POST', {
          'content-type': 'application/json',
          'sec-fetch-site': 'none',
        }),
      ),
    ).toBeNull();
  });

  it('rejects same-site Sec-Fetch-Site (tightened policy)', () => {
    // The audit flagged this — `same-site` would have allowed any
    // subdomain of the deployment's eTLD+1 to mutate state. The
    // current policy rejects it; this test pins that decision.
    const resp = csrfGuard(
      req('POST', {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-site',
      }),
    );
    expect(resp?.status).toBe(403);
  });

  it('rejects cross-site Sec-Fetch-Site', () => {
    const resp = csrfGuard(
      req('POST', {
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      }),
    );
    expect(resp?.status).toBe(403);
  });

  it('falls back to Origin equality when Sec-Fetch-Site is absent', () => {
    expect(
      csrfGuard(
        req('POST', {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        }),
      ),
    ).toBeNull();
  });

  it('rejects mismatched Origin (403)', () => {
    const resp = csrfGuard(
      req('POST', {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
      }),
    );
    expect(resp?.status).toBe(403);
  });

  it('rejects `Origin: null` (browser extensions / sandboxed iframes)', () => {
    // The audit's recommended tightening — was previously allowed.
    const resp = csrfGuard(
      req('POST', { 'content-type': 'application/json', origin: 'null' }),
    );
    expect(resp?.status).toBe(403);
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(
      csrfGuard(
        req('POST', {
          'content-type': 'application/json',
          referer: 'http://localhost:3000/some/page',
        }),
      ),
    ).toBeNull();
  });

  it('rejects mismatched Referer', () => {
    const resp = csrfGuard(
      req('POST', {
        'content-type': 'application/json',
        referer: 'https://evil.example.com/x',
      }),
    );
    expect(resp?.status).toBe(403);
  });

  it('rejects malformed Referer', () => {
    const resp = csrfGuard(
      req('POST', {
        'content-type': 'application/json',
        referer: 'not-a-url',
      }),
    );
    expect(resp?.status).toBe(403);
  });

  it('allows programmatic JSON clients with no headers (curl / our own UI)', () => {
    expect(
      csrfGuard(req('POST', { 'content-type': 'application/json' })),
    ).toBeNull();
  });

  it('rejects programmatic non-JSON clients with no headers', () => {
    const resp = csrfGuard(req('POST', {}));
    expect(resp?.status).toBe(403);
  });
});
