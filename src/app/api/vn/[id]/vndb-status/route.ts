import { NextRequest, NextResponse } from 'next/server';
import {
  deleteUlistEntry,
  fetchUlistEntry,
  fetchUlistLabels,
  patchUlistEntry,
  type UlistPatch,
} from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Tiny route to drive the "VNDB list status" panel on /vn/[id].
 * GET returns the user's current ulist entry + every available label.
 * PATCH mutates labels / vote / dates / notes via `labels_set` + `labels_unset`
 * so anything the user changed elsewhere stays intact.
 * DELETE removes the VN from the list entirely.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const labels = await fetchUlistLabels();
    if (typeof labels === 'object' && 'needsAuth' in labels) {
      return NextResponse.json({ needsAuth: true, entry: null, labels: [] });
    }
    const entry = await fetchUlistEntry(id);
    if (entry && typeof entry === 'object' && 'needsAuth' in entry) {
      return NextResponse.json({ needsAuth: true, entry: null, labels });
    }
    return NextResponse.json({ entry, labels });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: UlistPatch = {};
  if (Array.isArray(body.labels_set)) {
    patch.labels_set = body.labels_set.map((n) => Number(n)).filter((n) => Number.isInteger(n));
  }
  if (Array.isArray(body.labels_unset)) {
    patch.labels_unset = body.labels_unset.map((n) => Number(n)).filter((n) => Number.isInteger(n));
  }
  if ('vote' in body) {
    const v = body.vote;
    if (v === null || v === '') patch.vote = null;
    else if (typeof v === 'number' && v >= 10 && v <= 100) patch.vote = v;
    else return NextResponse.json({ error: 'vote must be 10-100 or null' }, { status: 400 });
  }
  if ('notes' in body) patch.notes = (body.notes as string | null) || null;
  if ('started' in body) patch.started = (body.started as string | null) || null;
  if ('finished' in body) patch.finished = (body.finished as string | null) || null;

  try {
    const r = await patchUlistEntry(id, patch);
    if ('needsAuth' in r) return NextResponse.json({ error: 'VNDB token required' }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const r = await deleteUlistEntry(id);
    if ('needsAuth' in r) return NextResponse.json({ error: 'VNDB token required' }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
