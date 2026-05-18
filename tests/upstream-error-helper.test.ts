/**
 * R5-129 pin: every `/api/*` route that returns a 502 funnels the
 * upstream error through `upstreamError(label, err)` so:
 *
 *   - The raw upstream message is logged server-side (operator can
 *     still diagnose).
 *   - The client receives a generic `{ error: 'upstream service
 *     unavailable' }` body — no leak of upstream URLs, stack
 *     traces, or echoed request bodies (which could include
 *     credentials).
 *
 * Two parts:
 *   1. Behaviour — `upstreamError(label, err)` returns the
 *      sanitized 502, and `console.error` receives the detail.
 *   2. Sweep — every `src/app/api/**\/route.ts` file that returns
 *      a 502 imports + calls `upstreamError`. The previous
 *      `{ error: (err as Error).message }` shape must not survive
 *      anywhere in that 502 path.
 */
import { describe, expect, it, vi } from 'vitest';
import { upstreamError } from '@/lib/api-error';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkApiRoutes(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkApiRoutes(p);
    else if (entry === 'route.ts') yield p;
  }
}

describe('upstreamError — R5-129 behaviour', () => {
  it('returns a 502 with a generic body', async () => {
    const res = upstreamError('test-route', new Error('upstream 503: details'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: 'upstream service unavailable' });
  });

  it('logs the detail to console.error with the route label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      upstreamError('test-route/123', new Error('boom'));
      expect(spy).toHaveBeenCalledWith('[upstream:test-route/123] boom');
    } finally {
      spy.mockRestore();
    }
  });

  it('handles non-Error throwables', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = upstreamError('rt', 'string-thrown');
      expect(res.status).toBe(502);
      expect(spy).toHaveBeenCalledWith('[upstream:rt] string-thrown');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('R5-129 sweep — no leaky 502 returns survive in /api/*', () => {
  const apiDir = join(ROOT, 'src/app/api');
  const routes = Array.from(walkApiRoutes(apiDir));

  it('the sweep covers a meaningful set of routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  for (const path of routes) {
    const src = readFileSync(path, 'utf8');
    const rel = path.slice(ROOT.length + 1);
    it(`${rel} has no raw .message leak in a 502 return`, () => {
      // Strip comments before scanning so the R5-129 reference
      // text inside docs / JSDoc doesn't trip the leak detector.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');
      // The old shape is a `NextResponse.json({ error: (… as Error).message }, { status: 502 })`.
      // After the sweep no such literal should survive in code.
      expect(code).not.toMatch(
        /NextResponse\.json\(\s*\{\s*error:\s*\((?:err|e)\s+as\s+Error\)\.message[^}]*\}\s*,\s*\{\s*status:\s*502/,
      );
      // The dynamic message-template variant (e.g.
      //   { error: `failed: ${(e as Error).message}` })
      // must also be gone from 502 returns.
      expect(code).not.toMatch(
        /NextResponse\.json\(\s*\{\s*error:\s*`[^`]*\$\{[^}]*\(e\s+as\s+Error\)\.message[^}]*\}[^`]*`\s*\}\s*,\s*\{\s*status:\s*502/,
      );
    });
  }
});
