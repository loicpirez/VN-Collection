import { NextRequest, NextResponse } from 'next/server';
import { addVnToSeries, getSeries, isInCollection, isInCollectionMany, removeVnFromSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { walkSeriesRelations } from '@/lib/series-detect';

import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';

function parseSeriesId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }) {
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  if (!getSeries(sid)) return NextResponse.json({ error: 'series not found' }, { status: 404 });
  if (!/^v\d+$/i.test(vnId)) return NextResponse.json({ error: 'invalid vn id' }, { status: 400 });
  if (!isInCollection(vnId)) return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  const body = (await readJsonObject(req)) as { order_index?: number; expand?: boolean };
  const baseIndex = typeof body.order_index === 'number' ? body.order_index : 0;
  addVnToSeries(sid, vnId, baseIndex);

  // `expand` walks the seed's full series-relation graph and joins every
  // related VN the user already owns. Lets the user add e.g. volume
  // 1 → 2 → 3 of a series in one click instead of three.
  const added: string[] = [vnId];
  if (body.expand) {
    const related = walkSeriesRelations(vnId);
    // R5-142: one batched membership lookup for the relation graph.
    // The previous per-relation `isInCollection(r.id)` was a single
    // SELECT per node in a graph that can easily reach 20-30 nodes
    // for long-running series (Higurashi-style arc chains).
    const ownedRelatedSet = isInCollectionMany(related.map((r) => r.id));
    let idx = baseIndex + 1;
    for (const r of related) {
      if (!ownedRelatedSet.has(r.id)) continue;
      addVnToSeries(sid, r.id, idx);
      added.push(r.id);
      idx += 1;
    }
  }
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

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }) {
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
