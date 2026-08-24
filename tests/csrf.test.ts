import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  const saved = {
    ALLOW_TRUSTED_PROXY: process.env.ALLOW_TRUSTED_PROXY,
    TRUSTED_PROXY_SECRET: process.env.TRUSTED_PROXY_SECRET,
  };

  beforeEach(() => {
    delete process.env.ALLOW_TRUSTED_PROXY;
    delete process.env.TRUSTED_PROXY_SECRET;
  });

  afterEach(() => {
    if (saved.ALLOW_TRUSTED_PROXY === undefined) delete process.env.ALLOW_TRUSTED_PROXY;
    else process.env.ALLOW_TRUSTED_PROXY = saved.ALLOW_TRUSTED_PROXY;
    if (saved.TRUSTED_PROXY_SECRET === undefined) delete process.env.TRUSTED_PROXY_SECRET;
    else process.env.TRUSTED_PROXY_SECRET = saved.TRUSTED_PROXY_SECRET;
  });

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

  it('uses the forwarded public origin only when the proxy proof is valid', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = 'trusted-proxy-secret';
    const headers = {
      'content-type': 'application/json',
      origin: 'https://collection.example',
      'x-forwarded-for': '203.0.113.40',
      'x-forwarded-host': 'collection.example',
      'x-forwarded-proto': 'https',
      'x-proxy-secret': 'trusted-proxy-secret',
    };
    expect(csrfGuard(req('POST', headers))).toBeNull();
    expect(csrfGuard(req('POST', { ...headers, 'x-proxy-secret': 'wrong' }))?.status).toBe(403);
  });

  it('rejects malformed or incomplete forwarded origins instead of trusting them', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = 'trusted-proxy-secret';
    const base = {
      'content-type': 'application/json',
      origin: 'https://collection.example',
      'x-forwarded-for': '203.0.113.40',
      'x-proxy-secret': 'trusted-proxy-secret',
    };
    expect(csrfGuard(req('POST', {
      ...base,
      'x-forwarded-host': 'collection.example',
      'x-forwarded-proto': 'ftp',
    }))?.status).toBe(403);
    expect(csrfGuard(req('POST', {
      ...base,
      'x-forwarded-proto': 'https',
    }))?.status).toBe(403);
    expect(csrfGuard(req('POST', {
      ...base,
      'x-forwarded-host': '[',
      'x-forwarded-proto': 'https',
    }))?.status).toBe(403);
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
