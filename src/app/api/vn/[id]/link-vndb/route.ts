import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, migrateVnId, upsertVn } from '@/lib/db';
import { getVn } from '@/lib/vndb';

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
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^egs_\d+$/i.test(id)) {
    return NextResponse.json({ error: 'source must be an egs_NNN id' }, { status: 400 });
  }
  if (!getCollectionItem(id)) {
    return NextResponse.json({ error: 'synthetic entry not in collection' }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { vndb_id?: unknown };
  const target = typeof body.vndb_id === 'string' ? body.vndb_id.toLowerCase() : '';
  if (!/^v\d+$/i.test(target)) {
    return NextResponse.json({ error: 'vndb_id must look like vNNN' }, { status: 400 });
  }

  try {
    const vn = await getVn(target);
    if (!vn) return NextResponse.json({ error: 'VNDB id not found' }, { status: 404 });
    upsertVn(vn);
    migrateVnId(id, target);
    return NextResponse.json({ ok: true, vn_id: target });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
