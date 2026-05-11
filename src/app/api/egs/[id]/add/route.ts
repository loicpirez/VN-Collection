import { NextRequest, NextResponse } from 'next/server';
import {
  addToCollection,
  getCollectionItem,
  isValidStatus,
  upsertEgsOnlyVn,
  type CollectionPatch,
} from '@/lib/db';
import type { Status } from '@/lib/types';
import { fetchEgsGame, linkEgsToVn } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const egsId = Number(rawId);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid EGS id' }, { status: 400 });
  }
  const game = await fetchEgsGame(egsId);
  if (!game) {
    return NextResponse.json({ error: 'EGS game not found' }, { status: 404 });
  }
  const vnId = `egs:${egsId}`;
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
