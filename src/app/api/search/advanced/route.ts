import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { advancedSearchVn, type AdvancedSearchOptions } from '@/lib/vndb';
import { isInCollectionMany } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { PayloadTooLargeError, readBodyWithLimit } from '@/lib/read-limited-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_SORTS = new Set(['searchrank', 'rating', 'votecount', 'released', 'title']);
const MAX_JSON_BYTES = 64 * 1024;
const MAX_MULTI_VALUES = 32;
const INTEGER_KEYS: ReadonlySet<string> = new Set([
  'lengthMin',
  'lengthMax',
  'yearMin',
  'yearMax',
  'results',
  'page',
]);

/**
 * Build an `AdvancedSearchOptions` from `unknown`, rejecting anything
 * that isn't an exact-shape match. Without this gate the route would
 * route arbitrary JSON straight into VNDB filter tuples.
 */
function parseAdvancedBody(raw: unknown): { ok: true; opts: AdvancedSearchOptions } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const r = raw as Record<string, unknown>;
  const out: AdvancedSearchOptions = {};
  if ('q' in r) {
    if (typeof r.q !== 'string' || r.q.length > 200) return { ok: false, error: 'invalid q' };
    out.q = r.q;
  }
  for (const key of ['langs', 'platforms'] as const) {
    if (key in r) {
      const v = r[key];
      if (
        !Array.isArray(v)
        || v.length > MAX_MULTI_VALUES
        || v.some((s) => typeof s !== 'string' || s.length === 0 || s.length > 16)
      ) {
        return { ok: false, error: `invalid ${key}` };
      }
      out[key] = Array.from(new Set(v));
    }
  }
  const RANGE: Record<string, { min: number; max: number }> = {
    lengthMin: { min: 1, max: 5 },
    lengthMax: { min: 1, max: 5 },
    yearMin: { min: 1900, max: 2100 },
    yearMax: { min: 1900, max: 2100 },
    ratingMin: { min: 0, max: 100 },
    results: { min: 1, max: 100 },
    page: { min: 1, max: 100 },
  };
  for (const key of ['lengthMin', 'lengthMax', 'yearMin', 'yearMax', 'ratingMin', 'results', 'page'] as const) {
    if (key in r) {
      const v = r[key];
      if (
        typeof v !== 'number'
        || !Number.isFinite(v)
        || (INTEGER_KEYS.has(key) && !Number.isSafeInteger(v))
      ) {
        return { ok: false, error: `invalid ${key}` };
      }
      const range = RANGE[key];
      const clamped = Math.max(range.min, Math.min(range.max, v));
      out[key] = clamped;
    }
  }
  for (const key of ['hasScreenshot', 'hasReview', 'hasAnime', 'reverse'] as const) {
    if (key in r) {
      if (typeof r[key] !== 'boolean') return { ok: false, error: `invalid ${key}` };
      out[key] = r[key] as boolean;
    }
  }
  if ('sort' in r) {
    if (typeof r.sort !== 'string' || !VALID_SORTS.has(r.sort)) return { ok: false, error: 'invalid sort' };
    out.sort = r.sort as AdvancedSearchOptions['sort'];
  }
  return { ok: true, opts: out };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    const body = await readBodyWithLimit(req, MAX_JSON_BYTES);
    raw = JSON.parse(body.toString('utf8')) as unknown;
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: 'payload too large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = parseAdvancedBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const data = await advancedSearchVn(parsed.opts);
    // Single IN(...) lookup instead of one SELECT per result.
    const ownedIds = isInCollectionMany(data.results.map((v) => v.id));
    const results = data.results.map((v) => ({ ...v, in_collection: ownedIds.has(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return upstreamError('search/advanced', err);
  }
}
