import { NextRequest, NextResponse } from 'next/server';
import { addVnToSeries, db, getSeries, isInCollection, isInCollectionMany, removeVnFromSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { walkSeriesRelations } from '@/lib/series-detect';

import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';

function parseSeriesId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  if (!getSeries(sid)) return NextResponse.json({ error: 'series not found' }, { status: 404 });
  if (!isVndbVnId(vnId)) return NextResponse.json({ error: 'invalid vn id' }, { status: 400 });
  if (!isInCollection(vnId)) return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  const body = (await readJsonObject(req)) as { order_index?: number; expand?: boolean };
  const baseIndex = typeof body.order_index === 'number' ? body.order_index : 0;

  // `expand` walks the seed's full series-relation graph and joins every
  // related VN the user already owns. Lets the user add e.g. volume
  // 1 → 2 → 3 of a series in one click instead of three.
  //
  // Wrap the seed insert AND the expansion in a single transaction so
  // that a mid-loop crash (or a unique-constraint surprise on one of
  // the related VNs) doesn't leave a partial set of `series_vn` rows
  // with gaps in `order_index`. The seed is always added; the expand
  // path adds 0..N more rows atomically.
  const added: string[] = [];
  db.transaction(() => {
    addVnToSeries(sid, vnId, baseIndex);
    added.push(vnId);
    if (body.expand) {
      const related = walkSeriesRelations(vnId);
      const ownedRelatedSet = isInCollectionMany(related.map((r) => r.id));
      let idx = baseIndex + 1;
      for (const r of related) {
        if (!ownedRelatedSet.has(r.id)) continue;
        addVnToSeries(sid, r.id, idx);
        added.push(r.id);
        idx += 1;
      }
    }
  })();
  try {
    recordActivity({
      kind: 'series.link',
      entity: 'series',
      entityId: String(sid),
      label: 'Linked VN to series',
      payload: { added_count: added.length, expanded: !!body.expand },
    });
  } catch (e) {
    console.error(`[series:${sid}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ series: getSeries(sid), added });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  removeVnFromSeries(sid, vnId);
  try {
    recordActivity({
      kind: 'series.unlink',
      entity: 'series',
      entityId: String(sid),
      label: 'Unlinked VN from series',
      payload: { vn_id: vnId },
    });
  } catch (e) {
    console.error(`[series:${sid}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ series: getSeries(sid) });
}
