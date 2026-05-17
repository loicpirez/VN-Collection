import { NextRequest, NextResponse } from 'next/server';
import { clearEgsCache, linkEgsToVn, resolveEgsForVn } from '@/lib/erogamescape';
import { getVnEgsLink } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const allowSearch = sp.get('search') !== '0';
  const force = sp.get('refresh') === '1';
  try {
    const { game, source } = await resolveEgsForVn(id, { force, allowSearch });
    const manual = /^v\d+$/.test(id) ? getVnEgsLink(id) : null;
    return NextResponse.json({
      game,
      source,
      manual: manual
        ? { egs_id: manual.egs_id, updated_at: manual.updated_at }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { egs_id?: number };
  const egsId = Number(body.egs_id);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid egs_id' }, { status: 400 });
  }
  try {
    const game = await linkEgsToVn(id, egsId);
    if (!game) {
      return NextResponse.json({ error: 'EGS game not found' }, { status: 404 });
    }
    // Mapping created — record so the audit trail shows
    // "operator pinned VN→EGS" events. EGS ids are not secrets,
    // safe to include in the payload.
    try {
      recordActivity({
        kind: 'mapping.vn-egs',
        entity: 'vn',
        entityId: id,
        label: game.gamename ?? null,
        payload: { egs_id: egsId, action: 'pin' },
      });
    } catch {
      // Logging failure must never break the user write.
    }
    return NextResponse.json({ game, source: 'manual' as const });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/**
 * Clear the EGS link for a VN.
 *
 * Query params:
 *   ?mode=auto          (default) drop the cached row; auto-resolver re-runs.
 *   ?mode=manual-none   drop the cached row AND pin "no EGS counterpart"
 *                        so the auto-resolver stops trying.
 *   ?mode=clear-manual  drop the cached row AND remove any prior manual
 *                        pin so the auto-resolver gets a fresh shot.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const raw = req.nextUrl.searchParams.get('mode');
  const mode: 'auto' | 'manual-none' | 'clear-manual' =
    raw === 'manual-none' ? 'manual-none' :
    raw === 'clear-manual' ? 'clear-manual' : 'auto';
  clearEgsCache(id, mode);
  // Record the clear; useful to distinguish "I cleared the
  // cache" from "I pinned no-EGS-counterpart".
  try {
    recordActivity({
      kind: 'mapping.vn-egs',
      entity: 'vn',
      entityId: id,
      label: id,
      payload: { action: 'clear', mode },
    });
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: true, mode });
}
