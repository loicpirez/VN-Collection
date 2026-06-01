/**
 * R5-148 pin: every `/api/*` route that parses a JSON body funnels
 * through `readJsonObject(req)` from `@/lib/api-body`, which:
 *
 *   - Catches JSON parse failure (missing body, malformed
 *     JSON) and returns `{}`.
 *   - Stops reading at the shared streamed byte cap and returns `{}`.
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
import { NextRequest } from 'next/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkApi(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkApi(p);
    else if (/\.(tsx?|jsx?)$/.test(entry)) yield p;
  }
}

const UNSAFE_REQ_JSON = /await\s+req\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\)/;

function fakeReq(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function fakeReqThrows(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
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

  it('returns {} when the streamed body exceeds the shared cap', async () => {
    expect(await readJsonObject(fakeReq({ value: 'a'.repeat(1024 * 1024) }))).toEqual({});
  });
});

describe('R5-148 sweep — no unsafe `(await req.json().catch(...))` survives under src/app/api/', () => {
  it('no unsafe pattern remains', () => {
    const offenders: string[] = [];
    for (const path of walkApi(join(ROOT, 'src/app/api'))) {
      const src = readFileSync(path, 'utf8');
      if (UNSAFE_REQ_JSON.test(src)) offenders.push(path.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });
});

describe('SECA-011 sweep — API JSON parsing stays on bounded helpers', () => {
  it('no direct req.json() call survives under src/app/api/', () => {
    const offenders: string[] = [];
    for (const path of walkApi(join(ROOT, 'src/app/api'))) {
      const src = readFileSync(path, 'utf8');
      if (/\breq\.json\(\)/.test(src)) offenders.push(path.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });

  it('collection import bounds JSON and multipart streams before parsing', () => {
    const src = readFileSync(
      join(ROOT, 'src/app/api/collection/import/route.ts'),
      'utf8',
    );
    expect(src).toContain('reparseWithLimit(req, MAX_IMPORT_BYTES)');
    expect(src).toContain('readBodyWithLimit(req, MAX_IMPORT_BYTES)');
  });
});
