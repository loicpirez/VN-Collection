import { NextRequest, NextResponse } from 'next/server';
import { listUserActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { parseBoundedQueryInteger, parseOptionalQueryInteger } from '@/lib/api-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Length cap for string filters before they flow into the LIKE clauses
 * inside `listUserActivity`. The helper already escapes `%`/`_` (audit
 * S-040), so a hostile pattern can't widen the match — but a multi-MB
 * value would still waste planner / scanner work. 200 chars is plenty
 * for any realistic kind / entity / search query.
 */
const TEXT_FILTER_MAX = 200;

function clampText(v: string | null): string | null {
  if (v == null) return null;
  return v.slice(0, TEXT_FILTER_MAX);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const sp = req.nextUrl.searchParams;
  try {
    // `limit` is clamped to [1, 500] inside `listUserActivity`; defaulting
    // here keeps the explicit-default-when-omitted behaviour while still
    // forcing every overlarge / negative caller-supplied value through the
    // helper's clamp. Without this, `?limit=999999999` would propagate to
    // the helper and rely on the inner Math.min — the explicit local cap
    // documents the contract at the entry point too.
    return NextResponse.json({
      activity: listUserActivity({
        limit: parseBoundedQueryInteger(sp.get('limit'), { fallback: 100, min: 1, max: 500 }),
        kind: clampText(sp.get('kind')),
        entity: clampText(sp.get('entity')),
        q: clampText(sp.get('q')),
        from: parseOptionalQueryInteger(sp.get('from')),
        to: parseOptionalQueryInteger(sp.get('to')),
      }),
    });
  } catch (err) {
    console.error('[activity] DB error:', (err as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
