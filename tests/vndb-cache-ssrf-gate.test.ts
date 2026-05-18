/**
 * R5-125 pin: `vndb-cache.ts:doFetch` gates the primary URL through
 * the shared SSRF allowlist (`isAllowedHttpTarget`) BEFORE issuing
 * any HTTP request. The mirror swap path already re-checked the
 * rewritten URL; this closes the implicit-trust gap on the primary.
 *
 * Source-pin: the function body must contain an
 * `isAllowedHttpTarget(url)` check that throws when it fails. We
 * keep the test source-level (not network-level) because the
 * `doFetch` function is private (not exported) and the network
 * machinery is out of scope for a unit test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SOURCE = readFileSync(join(ROOT, 'src/lib/vndb-cache.ts'), 'utf8');

describe('vndb-cache.ts — R5-125 SSRF allowlist on primary URL', () => {
  it('doFetch body invokes isAllowedHttpTarget(url) before any fetch', () => {
    const body = SOURCE.split('async function doFetch')[1]?.split('async function fetchOnce')[0] ?? '';
    expect(body).toMatch(/isAllowedHttpTarget\(url\)/);
  });

  it('doFetch throws on a non-allowlisted URL', () => {
    const body = SOURCE.split('async function doFetch')[1]?.split('async function fetchOnce')[0] ?? '';
    // The gate must short-circuit (throw) — otherwise the
    // throttledFetch below would still issue the request.
    expect(body).toMatch(/if\s*\(\s*!isAllowedHttpTarget\(url\)\s*\)/);
    expect(body).toMatch(/throw\s+new\s+Error\(/);
  });

  it('the module imports isAllowedHttpTarget from url-allowlist', () => {
    expect(SOURCE).toMatch(/from\s+['"]\.\/url-allowlist['"]/);
    expect(SOURCE).toMatch(/isAllowedHttpTarget/);
  });
});
