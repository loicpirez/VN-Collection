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
      // R5-129: the EgsUnreachable.kind classifies the failure
      // (network / timeout / 5xx) and is safe to surface; the
      // underlying e.message can include the raw HTTP body and
      // belongs only in the server log. `upstreamError` logs the
      // full diagnostic detail and returns a generic 502 to the
      // client.
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

  // Optional initial collection state passed by the caller (status, favorite…).
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const patch: CollectionPatch = {
    status: isValidStatus(body.status) ? (body.status as Status) : 'planning',
  };
  addToCollection(vnId, patch);

  // Track EGS-only adds as a distinct event so the activity log
  // can distinguish "VNDB add" from "synthetic EGS-only add".
  try {
    recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: vnId,
      label: game.gamename ?? `EGS #${egsId}`,
      payload: { source: 'egs', egs_id: egsId, status: patch.status ?? null },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ vn_id: vnId, item: getCollectionItem(vnId) });
}
