import { NextRequest, NextResponse } from 'next/server';
import { isValidStatus } from '@/lib/db';
import type { Status } from '@/lib/types';
import { EgsUnreachable, fetchEgsGame, linkEgsToVn } from '@/lib/erogamescape';
import { recordActivity } from '@/lib/activity';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { invalidateCollectionVnIdsCache } from '@/lib/collection-vn-ids-cache';
import { readJsonObject } from '@/lib/api-body';
import { apiErrorBody } from '@/lib/api-error-shape';
import { getCollectionCoreRepository, type CollectionCorePatch } from '@/lib/db/repositories/collection-core';
import { getEgsRepository } from '@/lib/db/repositories/egs';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { getVnWriteRepository } from '@/lib/db/repositories/vn-write';
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
  const patch: CollectionCorePatch = { status: isValidStatus(body.status) ? (body.status as Status) : 'planning' };
  const collectionRepository = getCollectionCoreRepository();
  const egsRepository = getEgsRepository();
  const vnReader = getVnReadRepository();
  const vnWriter = getVnWriteRepository();
  const syntheticVnId = `egs_${egsId}`;
  const mappedVnId = (await egsRepository.getEgsLink(egsId))?.vn_id ?? null;
  const targetVnId = mappedVnId ?? syntheticVnId;
  if (await collectionRepository.contains(targetVnId)) {
    return NextResponse.json(
      apiErrorBody('game is already in the collection', 'already_exists', `egs/${egsId}/add`, targetVnId),
      { status: 409 },
    );
  }
  if (mappedVnId) {
    if ((await vnReader.getCovers([mappedVnId])).length === 0) {
      return NextResponse.json(
        apiErrorBody('mapped VN is not available locally', 'needs_mapping', `egs/${egsId}/add`, mappedVnId),
        { status: 409 },
      );
    }
    await collectionRepository.add(mappedVnId, patch);
    invalidateCollectionVnIdsCache();
    try {
      await recordActivity({
        kind: 'collection.add',
        entity: 'vn',
        entityId: mappedVnId,
        label: mappedVnId,
        payload: { source: 'egs', egs_id: egsId, status: patch.status },
      });
    } catch {
      // Activity logging must not roll back a completed collection mutation.
    }
    return NextResponse.json({ vn_id: mappedVnId, item: await vnReader.getCollectionItem(mappedVnId) });
  }
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
    return NextResponse.json(
      apiErrorBody('EGS game not found', 'egs_game_not_found', `egs/${egsId}/add`),
      { status: 404 },
    );
  }
  // URL-safe synthetic id. We used to use `egs:NNN` but a literal colon in the
  // path breaks Next.js' dynamic-route matcher (`params.id` arrives as
  // `egs%3A894`, which fails our /^egs_\d+$/ check). Underscore avoids the
  // dance entirely. Existing rows are migrated at DB startup.
  const vnId = syntheticVnId;
  await vnWriter.upsertEgsOnly({
    vnId,
    title: game.gamename || `EGS #${egsId}`,
    alttitle: game.gamename_furigana,
    released: game.sellday,
    description: game.description,
    imageUrl: game.image_url,
  });
  await linkEgsToVn(vnId, egsId);

  await collectionRepository.add(vnId, patch);
  invalidateCollectionVnIdsCache();

  // Track EGS-only adds as a distinct event so the activity log
  // can distinguish "VNDB add" from "synthetic EGS-only add".
  try {
    await recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: vnId,
      label: game.gamename,
      payload: { source: 'egs', egs_id: egsId, status: patch.status },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ vn_id: vnId, item: await vnReader.getCollectionItem(vnId) });
}
