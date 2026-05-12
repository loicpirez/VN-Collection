import { NextRequest, NextResponse } from 'next/server';
import { computeSteamSuggestions, fetchOwnedGames } from '@/lib/steam';
import { updateCollection, isInCollection } from '@/lib/db';

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
    return NextResponse.json({ ok: true, suggestions: computeSteamSuggestions(games) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { applies?: { vn_id?: unknown; playtime_minutes?: unknown }[] };
  if (!Array.isArray(body.applies)) return NextResponse.json({ error: 'applies array required' }, { status: 400 });
  let applied = 0;
  for (const a of body.applies) {
    if (typeof a.vn_id !== 'string' || typeof a.playtime_minutes !== 'number') continue;
    if (!isInCollection(a.vn_id)) continue;
    updateCollection(a.vn_id, { playtime_minutes: Math.max(0, Math.floor(a.playtime_minutes)) });
    applied += 1;
  }
  return NextResponse.json({ applied });
}
