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
import { recordActivity } from '@/lib/activity';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const egsId = Number(rawId);
  if (!Number.isSafeInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid EGS id' }, { status: 400 });
  }
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  if ('status' in body && !isValidStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  const patch: CollectionPatch = {
    status: isValidStatus(body.status) ? (body.status as Status) : 'planning',
  };
  // Distinguish "EGS is unreachable" (502) from "lookup succeeded but
  let game: Awaited<ReturnType<typeof fetchEgsGame>>;
  try {
    game = await fetchEgsGame(egsId);
  } catch (e) {
    if (e instanceof EgsUnreachable) {
      return upstreamError(`egs/${egsId}/add (${e.kind})`, e);
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

  addToCollection(vnId, patch);

  // Track EGS-only adds as a distinct event so the activity log
  // can distinguish "VNDB add" from "synthetic EGS-only add".
  try {
    recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: vnId,
      label: game.gamename,
      payload: { source: 'egs', egs_id: egsId, status: patch.status },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ vn_id: vnId, item: getCollectionItem(vnId) });
}
