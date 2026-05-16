import { NextRequest, NextResponse } from 'next/server';
import { clearEgsVnLink, getEgsVnLink, setEgsVnLink } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Resolve `id` as a positive integer EGS game id, or return null. */
function parseEgsId(raw: string): number | null {
  const cleaned = raw.replace(/^egs_/i, '');
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = parseEgsId(id);
  if (egsId == null) {
    return NextResponse.json({ error: 'invalid egs id' }, { status: 400 });
  }
  const link = getEgsVnLink(egsId);
  return NextResponse.json({ link });
}

/**
 * Pin a VNDB id for a given EGS game.
 *
 * Body: { vndb_id: 'v123' | null }
 *
 * `null` records the explicit decision "this EGS row has no VNDB counterpart"
 * — the UI uses this to dim the map button instead of inviting the user to
 * try yet again. Pass `mode: 'clear'` to remove the override entirely.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = parseEgsId(id);
  if (egsId == null) {
    return NextResponse.json({ error: 'invalid egs id' }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { vndb_id?: string | null };
  const raw = body.vndb_id;
  if (raw === null) {
    setEgsVnLink(egsId, null);
    return NextResponse.json({ ok: true, link: getEgsVnLink(egsId) });
  }
  if (typeof raw !== 'string' || !/^v\d+$/.test(raw)) {
    return NextResponse.json({ error: 'invalid vndb_id' }, { status: 400 });
  }
  setEgsVnLink(egsId, raw);
  return NextResponse.json({ ok: true, link: getEgsVnLink(egsId) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = parseEgsId(id);
  if (egsId == null) {
    return NextResponse.json({ error: 'invalid egs id' }, { status: 400 });
  }
  clearEgsVnLink(egsId);
  return NextResponse.json({ ok: true });
}
