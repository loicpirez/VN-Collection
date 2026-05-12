import { NextResponse } from 'next/server';
import { fetchOwnedGames, listUnlinkedSteamGames } from '@/lib/steam';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Returns every Steam game *not* already linked to a VN. The /steam UI
 * uses this to power the manual-assign search box.
 */
export async function GET() {
  try {
    const games = await fetchOwnedGames();
    return NextResponse.json({ ok: true, games: listUnlinkedSteamGames(games) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
