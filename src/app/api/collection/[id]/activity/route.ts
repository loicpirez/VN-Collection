import { NextRequest, NextResponse } from 'next/server';
import { addManualActivity, deleteActivity, isInCollection, listActivityForVn } from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ entries: listActivityForVn(id, 100) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as { text?: unknown; occurred_at?: unknown };
  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    return NextResponse.json({ error: 'text required' }, { status: 400 });
  }
  const at = typeof body.occurred_at === 'number' && body.occurred_at > 0 ? body.occurred_at : undefined;
  const entry = addManualActivity(id, body.text, at);
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const eid = Number(req.nextUrl.searchParams.get('entry'));
  if (!Number.isInteger(eid) || eid <= 0) {
    return NextResponse.json({ error: 'entry required' }, { status: 400 });
  }
  deleteActivity(eid);
  return NextResponse.json({ ok: true });
}
