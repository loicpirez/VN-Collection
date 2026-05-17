import { NextRequest, NextResponse } from 'next/server';
import { cacheStats, clearCache, deleteCacheByPathPrefix, pruneExpiredCache } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';

function logCacheInvalidate(payload: Record<string, unknown>) {
  try {
    recordActivity({
      kind: 'cache.invalidate',
      entity: 'cache',
      entityId: null,
      label: 'Invalidated VNDB cache',
      payload,
    });
  } catch (e) {
    console.error('[vndb-cache] activity log failed:', (e as Error).message);
  }
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Cache stats include the list of cached path tags — minor info
  // disclosure (reveals which endpoints the user hits). Gate too.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  return NextResponse.json({ stats: cacheStats() });
}

export async function DELETE(req: NextRequest) {
  // Cache wipe forces slow re-fetches against the rate-limited
  // VNDB endpoint — DoS amplifier from anywhere on the LAN.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'all';
  const prefix = sp.get('prefix');

  if (mode === 'expired') {
    const removed = pruneExpiredCache();
    logCacheInvalidate({ mode, removed });
    return NextResponse.json({ ok: true, removed, mode });
  }
  if (mode === 'prefix' && prefix) {
    // Reject prefixes containing LIKE wildcards. The path-tag space
    // looks like `POST /vn:producer:p90017`; wildcards in here would
    // either over-match (`%` matches everything) or be matched
    // literally (the underscore was the worst — `_` matches any
    // single char and is common in EGS path tags). Either way the
    // user almost certainly didn't intend the wildcard behavior.
    if (/[%_\\]/.test(prefix)) {
      return NextResponse.json(
        { error: 'prefix contains LIKE wildcard chars (% _ \\)' },
        { status: 400 },
      );
    }
    const removed = deleteCacheByPathPrefix(prefix);
    logCacheInvalidate({ mode, prefix, removed });
    return NextResponse.json({ ok: true, removed, mode, prefix });
  }
  const removed = clearCache();
  logCacheInvalidate({ mode: 'all', removed });
  return NextResponse.json({ ok: true, removed, mode: 'all' });
}
