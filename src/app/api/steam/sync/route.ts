import { NextRequest, NextResponse } from 'next/server';
import { computeSteamSuggestions, fetchOwnedGames, recordSync } from '@/lib/steam';
import { db, updateCollection, isInCollection } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Defensive ceiling on `applies` array size. Realistic batches are at
 * most a few hundred entries; anything larger is a hostile caller.
 */
const APPLIES_MAX = 2000;

/**
 * GET — preview suggestions.
 *   Hits Steam, cross-references against the local collection, returns
 *   one row per match with the proposed delta.
 *
 * POST — apply.
 *   Body: { applies: [{ vn_id, playtime_minutes }] } — caller is expected
 *   to confirm each row from the preview. The route writes them inside
 *   the existing `updateCollection` transaction so the activity log
 *   captures every change.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const games = await fetchOwnedGames();
    const suggestions = await computeSteamSuggestions(games);
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    const raw = (e as Error).message ?? 'unknown error';
    const safe = raw
      .replace(/key=[^&\s]+/g, 'key=***')
      .replace(/steamid=\d+/gi, 'steamid=***')
      .slice(0, 500);
    console.error('steam sync failed:', safe);
    const notConfigured = /Steam not configured/i.test(raw);
    const code = notConfigured ? 'steam_not_configured' : 'steam_sync_failed';
    return NextResponse.json(
      { ok: false, error: 'Steam sync failed', code },
      { status: notConfigured ? 400 : 502 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { applies?: { vn_id?: unknown; playtime_minutes?: unknown }[] };
  if (!Array.isArray(body.applies)) return NextResponse.json({ error: 'applies array required' }, { status: 400 });
  if (body.applies.length > APPLIES_MAX) {
    return NextResponse.json(
      { error: `applies exceeds limit of ${APPLIES_MAX}` },
      { status: 400 },
    );
  }
  let applied = 0;
  // Wrap the per-row writes in a transaction so a mid-loop crash leaves
  // either every confirmed row applied or none. Without this guard a
  // 1000-row apply that fails halfway would leave half the collection
  // updated with no rollback.
  db.transaction(() => {
    for (const a of body.applies!) {
      if (typeof a.vn_id !== 'string' || typeof a.playtime_minutes !== 'number') continue;
      if (!isInCollection(a.vn_id)) continue;
      const minutes = Math.max(0, Math.floor(a.playtime_minutes));
      updateCollection(a.vn_id, { playtime_minutes: minutes });
      recordSync(a.vn_id, minutes);
      applied += 1;
    }
  })();
  try {
    recordActivity({
      kind: 'steam.sync-apply',
      entity: 'steam',
      entityId: null,
      label: 'Applied Steam playtime sync',
      payload: { applied, requested: body.applies.length },
    });
  } catch (e) {
    console.error('[steam:sync] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ applied });
}
