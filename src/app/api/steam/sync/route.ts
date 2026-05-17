import { NextRequest, NextResponse } from 'next/server';
import { computeSteamSuggestions, fetchOwnedGames, recordSync } from '@/lib/steam';
import { updateCollection, isInCollection } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

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
export async function GET() {
  try {
    const games = await fetchOwnedGames();
    const suggestions = await computeSteamSuggestions(games);
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    // Audit H1: log the MASKED message, not the raw one. The Steam
    // resolver only masks `key=` inside its own typed errors; if any
    // future code path throws an Error whose .message contains the
    // request URL verbatim, the raw message would leak both the API
    // key and the SteamID to the server log even though the client
    // response is sanitized. Defence in depth: log `safe`, not `raw`.
    const raw = (e as Error).message ?? 'unknown error';
    const safe = raw
      .replace(/key=[^&\s]+/g, 'key=***')
      .replace(/steamid=\d+/gi, 'steamid=***');
    console.error('steam sync failed:', safe);
    return NextResponse.json({ ok: false, error: `Steam sync failed: ${safe}` }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { applies?: { vn_id?: unknown; playtime_minutes?: unknown }[] };
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
