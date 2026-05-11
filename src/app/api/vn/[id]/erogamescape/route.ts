import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem } from '@/lib/db';
import { getReleasesForVn } from '@/lib/vndb';
import { fetchEgsGame, findEgsIdInExtlinks, searchEgsByName, type EgsGame } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const allowSearch = req.nextUrl.searchParams.get('search') !== '0';
  try {
    const releases = await getReleasesForVn(id);
    let egsId: number | null = null;
    for (const release of releases) {
      const candidate = findEgsIdInExtlinks(release.extlinks ?? []);
      if (candidate != null) {
        egsId = candidate;
        break;
      }
    }

    let game: EgsGame | null = null;
    let source: 'extlink' | 'search' | null = null;
    if (egsId != null) {
      game = await fetchEgsGame(egsId);
      source = game ? 'extlink' : null;
    }
    if (!game && allowSearch) {
      const item = getCollectionItem(id);
      const probe = item?.alttitle?.trim() || item?.title?.trim();
      if (probe) {
        game = await searchEgsByName(probe);
        if (game) source = 'search';
      }
    }
    if (!game) {
      return NextResponse.json({ game: null, source: null });
    }
    return NextResponse.json({ game, source });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
