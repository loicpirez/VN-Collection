/**
 * R5-130 pin: `0.0.0.0` is NOT loopback.
 *
 * `0.0.0.0` is the "any interface" / "unspecified" address. Treating
 * it as loopback would let a deployment that listens on 0.0.0.0
 * (very common) silently bypass the admin-token gate when a
 * malicious header rewrites `Host: 0.0.0.0`.
 *
 * Source-pin only — the helpers are file-local so we can't import
 * them, but the structural invariant is easy to assert: neither
 * `isLoopbackHost` nor `isLoopbackIp` may match the literal
 * `'0.0.0.0'`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/lib/auth-gate.ts'),
  'utf8',
);

// Strip JSDoc / line comments before scanning for code references so
// the R5-130 explanatory comment in the source itself doesn't trip
// the assertion.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('auth-gate — 0.0.0.0 is not loopback (R5-130)', () => {
  const noComments = withoutComments(SOURCE);

  it('isLoopbackHost does not match 0.0.0.0', () => {
    const fn = noComments.match(/function isLoopbackHost\([\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn![0], 'isLoopbackHost code must not list 0.0.0.0').not.toMatch(/['"`]0\.0\.0\.0['"`]/);
  });

  it('isLoopbackIp does not match 0.0.0.0', () => {
    const fn = noComments.match(/function isLoopbackIp\([\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn![0], 'isLoopbackIp code must not list 0.0.0.0').not.toMatch(/['"`]0\.0\.0\.0['"`]/);
  });

  it('still matches 127.0.0.1 / ::1 / localhost', () => {
    expect(SOURCE).toMatch(/'127\.0\.0\.1'/);
    expect(SOURCE).toMatch(/'::1'/);
    expect(SOURCE).toMatch(/'localhost'/);
  });

  it('carries an R5-130 comment so future maintainers know why', () => {
    expect(SOURCE).toMatch(/R5-130/);
  });
});
