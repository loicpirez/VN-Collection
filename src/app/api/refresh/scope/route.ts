import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';
import { resolveScopePatterns } from '@/lib/refresh-scopes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * R5-058 / R5-106 / R5-215 — context-specific cache invalidation.
 *
 * Unlike `/api/refresh/global` (which busts every page-level cache
 * AND re-fetches them in a long fan-out), this route only busts
 * the cache rows for ONE specific scope and returns. The page that
 * triggered the bust handles its own re-fetch on the next render
 * via the normal `cachedFetch` flow.
 *
 * Body: { scope: string, params?: Record<string, string> }
 *   - `scope` must be a registered id in `REFRESH_SCOPES`
 *     (e.g. 'tag-detail', 'upcoming-anticipated').
 *   - `params` supplies values for templated patterns (e.g.
 *     `{ gid: 'g73' }` for the `tag-detail` scope's
 *     `tag_full:{gid}` pattern).
 *
 * Response: { ok, deleted, patterns, scope }
 *
 * Hardening:
 *   - localhost / admin-token gate via `requireLocalhostOrToken`,
 *     mirroring `/api/refresh/global` — destructive cache writes
 *     should not be reachable from the LAN.
 *   - Param values are validated against `[A-Za-z0-9_-]+` inside
 *     `resolveScopePatterns` so a caller can't pass `%` to widen
 *     the bust.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = await readJsonObject(req);
  const scopeId = typeof body.scope === 'string' ? body.scope : '';
  const rawParams = body.params;
  const params: Record<string, string> = {};
  if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      if (typeof v === 'string') params[k] = v;
    }
  }

  let patterns: string[];
  try {
    patterns = resolveScopePatterns(scopeId, params);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }

  // Bust each pattern inside a transaction so partial failures
  // don't leave the cache in a half-busted state.
  const stmt = db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?');
  let deleted = 0;
  db.transaction(() => {
    for (const p of patterns) {
      deleted += stmt.run(p).changes;
    }
  })();

  try {
    recordActivity({
      kind: 'refresh.scope',
      entity: 'cache',
      entityId: scopeId,
      label: `Scoped refresh: ${scopeId}`,
      payload: { patterns, deleted },
    });
  } catch (e) {
    console.error(`[refresh:${scopeId}] activity log failed:`, (e as Error).message);
  }

  return NextResponse.json({ ok: true, deleted, patterns, scope: scopeId });
}
