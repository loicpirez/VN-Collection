import { NextRequest, NextResponse } from 'next/server';
import { isInCollection, setCustomDescription } from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const raw = body.text;
  if (raw != null && typeof raw !== 'string') {
    return NextResponse.json({ error: 'text must be a string or null' }, { status: 400 });
  }
  setCustomDescription(id, raw ?? null);
  return NextResponse.json({ ok: true });
}
