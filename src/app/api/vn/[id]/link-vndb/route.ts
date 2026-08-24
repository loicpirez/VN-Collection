import { NextRequest, NextResponse } from 'next/server';
import { internalError, upstreamError } from '@/lib/api-error';
import { getVn } from '@/lib/vndb';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getVnIdentityRepository } from '@/lib/db/repositories/vn-identity';
import { getVnWriteRepository } from '@/lib/db/repositories/vn-write';
import { invalidateCollectionVnIdsCache } from '@/lib/collection-vn-ids-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Promote an EGS-only synthetic entry (vn_id like `egs_NNN`) to a real
 * VNDB VN. Steps:
 *   1. Fetch the supplied vNNN payload from VNDB.
 *   2. upsertVn so the real row exists.
 *   3. migrateVnId moves every reference (collection, owned_release,
 *      quotes, routes, series, activity, credits, egs_game) to the new
 *      id and drops the synthetic row.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!/^egs_\d+$/i.test(id)) {
    return NextResponse.json({ error: 'source must be an egs_NNN id' }, { status: 400 });
  }
  if (!await getCollectionCoreRepository().contains(id)) {
    return NextResponse.json({ error: 'synthetic entry not in collection' }, { status: 404 });
  }
  const body = (await readJsonObject(req)) as { vndb_id?: unknown };
  const target = typeof body.vndb_id === 'string' ? body.vndb_id.toLowerCase() : '';
  if (!isVndbVnId(target)) {
    return NextResponse.json({ error: 'vndb_id must look like vNNN' }, { status: 400 });
  }

  let vn: Awaited<ReturnType<typeof getVn>>;
  try {
    vn = await getVn(target);
  } catch (error) {
    return upstreamError('vn/[id]/link-vndb', error);
  }
  if (!vn) return NextResponse.json({ error: 'VNDB id not found' }, { status: 404 });
  try {
    await getVnWriteRepository().upsert(vn);
    await getVnIdentityRepository().migrate(id, target);
    invalidateCollectionVnIdsCache();
  } catch (error) {
    return internalError('vn/[id]/link-vndb', error);
  }
  try {
    await recordActivity({
      kind: 'mapping.vndb.link',
      entity: 'vn',
      entityId: target,
      label: 'Linked VNDB id',
      payload: { from: id, to: target },
    });
  } catch {
    // The completed identity migration must not be reported as failed when activity logging is unavailable.
  }
  return NextResponse.json({ ok: true, vn_id: target });
}
