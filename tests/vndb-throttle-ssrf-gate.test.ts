/**
 * R5-121 pin: `throttledFetch` gates the request URL through
 * the shared SSRF allowlist (`isAllowedHttpTarget`) BEFORE any
 * HTTP traffic. Closes the implicit-trust gap on the VNDB
 * write path (`vndb-sync.ts:pushStatusToVndb` uses
 * `throttledFetch(...)` directly, bypassing the cached-fetch
 * gate added in R5-125).
 *
 * Source-pin only — the throttle queue + retry loop is out of
 * scope for a unit test. We assert:
 *
 *   1. The module imports `isAllowedHttpTarget` from
 *      `./url-allowlist`.
 *   2. The `throttledFetch` body calls
 *      `if (!isAllowedHttpTarget(url)) throw new Error(...)`
 *      BEFORE the `await acquire()` / `fetch(url, init)`
 *      machinery.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/lib/vndb-throttle.ts'),
  'utf8',
);

describe('vndb-throttle — R5-121 SSRF gate', () => {
  it('imports isAllowedHttpTarget from url-allowlist', () => {
    expect(SOURCE).toMatch(/from\s+['"]\.\/url-allowlist['"]/);
    expect(SOURCE).toMatch(/\bisAllowedHttpTarget\b/);
  });

  it('throttledFetch body invokes the gate before the fetch loop', () => {
    const body = SOURCE.split('export async function throttledFetch')[1]?.split('\n}')[0] ?? '';
    expect(body).toMatch(/isAllowedHttpTarget\(url\)/);
    expect(body).toMatch(/if\s*\(\s*!isAllowedHttpTarget\(url\)\s*\)/);
    expect(body).toMatch(/throw\s+new\s+Error\(/);
    // Sanity check: the throw must come BEFORE the await/fetch loop.
    const gateIdx = body.indexOf('isAllowedHttpTarget');
    const fetchIdx = body.indexOf('fetch(url');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(gateIdx);
  });
});
