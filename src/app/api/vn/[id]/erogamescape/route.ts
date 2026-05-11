import { NextRequest, NextResponse } from 'next/server';
import { clearEgsCache, linkEgsToVn, resolveEgsForVn } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const allowSearch = sp.get('search') !== '0';
  const force = sp.get('refresh') === '1';
  try {
    const { game, source } = await resolveEgsForVn(id, { force, allowSearch });
    return NextResponse.json({ game, source });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
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
    return NextResponse.json({ game, source: 'manual' as const });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  clearEgsCache(id);
  return NextResponse.json({ ok: true });
}
