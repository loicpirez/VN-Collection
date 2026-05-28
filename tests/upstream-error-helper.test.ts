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

describe('upstreamErrorbehaviour', () => {
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
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');
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
