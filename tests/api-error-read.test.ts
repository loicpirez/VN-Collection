/**
 * R5-147 pin: every client-side fetch handler that dereferences
 * `.error` on a JSON response funnels through `readApiError(r,
 * fallback)` from `@/lib/api-error-read`. The previous shape
 * relied on the untyped result of `r.json()` (or
 * `r.json().catch(() => ({}))`) — a `.error` access on an `any`
 * value that silently broke type-safety across ~90 surfaces.
 *
 * Two parts:
 *   1. Behaviour — `readApiError` returns the typed server error
 *      message, falls back to the caller-supplied string on
 *      parse failure, missing field, non-string field, or empty
 *      string.
 *   2. Sweep — no `(await *.json().catch(() => ({}))).error`
 *      shape survives anywhere under `src/`, and no
 *      `(await *.json()).error` shape either.
 */
import { describe, expect, it } from 'vitest';
import { readApiError } from '@/lib/api-error-read';
import { execSync } from 'node:child_process';

const ROOT = process.cwd().endsWith('vndb-collection-new')
  ? process.cwd()
  : (() => {
      // tests run with CWD at the repo root from `yarn test`; this
      // branch is a paranoia fallback for IDE runners.
      return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    })();

describe('readApiError — R5-147 behaviour', () => {
  it('returns the server-supplied error string when present', async () => {
    const r = new Response(JSON.stringify({ error: 'specific-message' }), {
      status: 500,
    });
    expect(await readApiError(r, 'fallback')).toBe('specific-message');
  });

  it('falls back when the body is not JSON', async () => {
    const r = new Response('not-json', { status: 500 });
    expect(await readApiError(r, 'fallback')).toBe('fallback');
  });

  it('falls back when the body has no error field', async () => {
    const r = new Response(JSON.stringify({ ok: false }), { status: 500 });
    expect(await readApiError(r, 'fallback')).toBe('fallback');
  });

  it('falls back when error is empty / non-string', async () => {
    const r1 = new Response(JSON.stringify({ error: '' }), { status: 500 });
    expect(await readApiError(r1, 'fallback')).toBe('fallback');
    const r2 = new Response(JSON.stringify({ error: 123 }), { status: 500 });
    expect(await readApiError(r2, 'fallback')).toBe('fallback');
    const r3 = new Response(JSON.stringify({ error: null }), { status: 500 });
    expect(await readApiError(r3, 'fallback')).toBe('fallback');
  });
});

describe('R5-147 sweep — no untyped .error access survives in src/', () => {
  it('no `(await *.json().catch(() => ({}))).error` pattern remains', () => {
    // Use grep -E and tolerate a zero-match exit status (1).
    let out = '';
    try {
      out = execSync(
        `grep -rnE 'await [a-zA-Z_]+\\.json\\(\\)\\.catch\\(\\(\\) => \\(\\{\\}\\)\\)\\)\\.error' src/`,
        { cwd: ROOT, encoding: 'utf8' },
      );
    } catch (e) {
      // grep exits 1 when no matches — that's the green path.
      out = (e as { stdout?: string }).stdout ?? '';
    }
    expect(out.trim()).toBe('');
  });

  it('no `(await *.json()).error` pattern survives (without .catch)', () => {
    let out = '';
    try {
      out = execSync(
        `grep -rnE 'await [a-zA-Z_]+\\.json\\(\\)\\)\\.error' src/`,
        { cwd: ROOT, encoding: 'utf8' },
      );
    } catch (e) {
      out = (e as { stdout?: string }).stdout ?? '';
    }
    expect(out.trim()).toBe('');
  });
});
