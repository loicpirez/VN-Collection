import { NextRequest, NextResponse } from 'next/server';
import { fetchOwnedGames, listUnlinkedSteamGames } from '@/lib/steam';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Returns every Steam game *not* already linked to a VN. The /steam UI
 * uses this to power the manual-assign search box.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const games = await fetchOwnedGames();
    return NextResponse.json({ ok: true, games: listUnlinkedSteamGames(games) });
  } catch (e) {
    console.error('[steam/library] fetch failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'steam library unavailable' }, { status: 502 });
  }
}
