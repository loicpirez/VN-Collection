/**
 * R5-148 pin: every `/api/*` route that parses a JSON body funnels
 * through `readJsonObject(req)` from `@/lib/api-body`, which:
 *
 *   - Catches `req.json()` parse failure (missing body, malformed
 *     JSON) and returns `{}`.
 *   - Catches the `null` / array / primitive variants of a
 *     well-formed but non-object body and returns `{}`.
 *
 * The previous `(await req.json().catch(() => ({})))` shape only
 * handled parse failure; it did NOT handle the case where the
 * client legitimately sent `null` as the body, which resolved
 * successfully and then crashed at the first field access.
 *
 * Two parts:
 *   1. Behaviour — `readJsonObject` returns `{}` for every
 *      non-object body shape and the actual object otherwise.
 *   2. Sweep — no `(await req.json().catch(() => ({})))` shape
 *      survives anywhere under `src/app/api/`.
 */
import { describe, expect, it } from 'vitest';
import { readJsonObject } from '@/lib/api-body';
import type { NextRequest } from 'next/server';
import { execSync } from 'node:child_process';

function fakeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function fakeReqThrows(): NextRequest {
  return {
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as NextRequest;
}

describe('readJsonObject — R5-148 behaviour', () => {
  it('returns the parsed object for a valid JSON object body', async () => {
    const out = await readJsonObject(fakeReq({ name: 'x', count: 3 }));
    expect(out).toEqual({ name: 'x', count: 3 });
  });

  it('returns {} when the body is null', async () => {
    expect(await readJsonObject(fakeReq(null))).toEqual({});
  });

  it('returns {} when the body is an array', async () => {
    expect(await readJsonObject(fakeReq([1, 2, 3]))).toEqual({});
  });

  it('returns {} when the body is a primitive (string / number)', async () => {
    expect(await readJsonObject(fakeReq('a string'))).toEqual({});
    expect(await readJsonObject(fakeReq(42))).toEqual({});
    expect(await readJsonObject(fakeReq(true))).toEqual({});
  });

  it('returns {} when req.json() throws (missing / malformed body)', async () => {
    expect(await readJsonObject(fakeReqThrows())).toEqual({});
  });
});

describe('R5-148 sweep — no unsafe `(await req.json().catch(...))` survives under src/app/api/', () => {
  it('no unsafe pattern remains', () => {
    let out = '';
    try {
      out = execSync(
        `grep -rnE 'await req\\.json\\(\\)\\.catch\\(\\(\\) => \\(\\{\\}\\)\\)' src/app/api/`,
        { cwd: process.cwd(), encoding: 'utf8' },
      );
    } catch (e) {
      // grep exits 1 when no matches — that's the green path.
      out = (e as { stdout?: string }).stdout ?? '';
    }
    expect(out.trim()).toBe('');
  });
});
