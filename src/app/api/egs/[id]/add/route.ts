import { NextRequest, NextResponse } from 'next/server';
import {
  addToCollection,
  getCollectionItem,
  isValidStatus,
  upsertEgsOnlyVn,
  type CollectionPatch,
} from '@/lib/db';
import type { Status } from '@/lib/types';
import { EgsUnreachable, fetchEgsGame, linkEgsToVn } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const egsId = Number(rawId);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid EGS id' }, { status: 400 });
  }
  // Distinguish "EGS is unreachable" (502) from "lookup succeeded but
  // returned zero rows" (404). `fetchEgsGame` previously collapsed both
  // into `null`, which the route surfaced as a misleading 404 during
  // transient network outages.
  let game: Awaited<ReturnType<typeof fetchEgsGame>>;
  try {
    game = await fetchEgsGame(egsId);
  } catch (e) {
    if (e instanceof EgsUnreachable) {
      return NextResponse.json({ error: `EGS ${e.kind}: ${e.message}` }, { status: 502 });
    }
    throw e;
  }
  if (!game) {
    return NextResponse.json({ error: 'EGS game not found' }, { status: 404 });
  }
  // URL-safe synthetic id. We used to use `egs:NNN` but a literal colon in the
  // path breaks Next.js' dynamic-route matcher (`params.id` arrives as
  // `egs%3A894`, which fails our /^egs_\d+$/ check). Underscore avoids the
  // dance entirely. Existing rows are migrated at DB startup.
  const vnId = `egs_${egsId}`;
  upsertEgsOnlyVn({
    vnId,
    title: game.gamename || `EGS #${egsId}`,
    alttitle: game.gamename_furigana,
    released: game.sellday,
    description: game.description,
    imageUrl: game.image_url,
  });
  await linkEgsToVn(vnId, egsId);

  // Optional initial collection state passed by the caller (status, favorite…).
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: CollectionPatch = {
    status: isValidStatus(body.status) ? (body.status as Status) : 'planning',
  };
  addToCollection(vnId, patch);

  return NextResponse.json({ vn_id: vnId, item: getCollectionItem(vnId) });
}
