import { NextRequest, NextResponse } from 'next/server';
import { computeSteamSuggestions, fetchOwnedGames, recordSync } from '@/lib/steam';
import { updateCollection, isInCollection } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

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
    // Audit S-004: surface a fixed user-visible error. The masked
    // detail still goes to the server log so the operator can
    // diagnose, but the JSON response stays opaque — a stray URL or
    // header fragment in `e.message` never reaches the client.
    const raw = (e as Error).message ?? 'unknown error';
    const safe = raw
      .replace(/key=[^&\s]+/g, 'key=***')
      .replace(/steamid=\d+/gi, 'steamid=***')
      .slice(0, 500);
    console.error('steam sync failed:', safe);
    // Audit I-016: emit a stable machine-readable `code` so the client
    // can detect "not configured" without string-matching English copy.
    // The previous handler returned the raw message; the client compared
    // its lowercased substring to detect the "set the keys" callout —
    // that comparison silently broke when the route was localized.
    const code = /Steam not configured/i.test(raw) ? 'steam_not_configured' : 'steam_sync_failed';
    return NextResponse.json({ ok: false, error: 'Steam sync failed', code }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { applies?: { vn_id?: unknown; playtime_minutes?: unknown }[] };
  if (!Array.isArray(body.applies)) return NextResponse.json({ error: 'applies array required' }, { status: 400 });
  let applied = 0;
  for (const a of body.applies) {
    if (typeof a.vn_id !== 'string' || typeof a.playtime_minutes !== 'number') continue;
    if (!isInCollection(a.vn_id)) continue;
    const minutes = Math.max(0, Math.floor(a.playtime_minutes));
    updateCollection(a.vn_id, { playtime_minutes: minutes });
    recordSync(a.vn_id, minutes);
    applied += 1;
  }
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
