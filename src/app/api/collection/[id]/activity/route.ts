import { NextRequest, NextResponse } from 'next/server';
import { addManualActivity, deleteActivityForVn, isInCollection, listActivityForVn } from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = validateVnIdOr400(id);
    if (bad) return bad;
    if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    return NextResponse.json({ entries: listActivityForVn(id, 100) });
  } catch (err) {
    return internalError('collection.activity.GET', err);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = validateVnIdOr400(id);
    if (bad) return bad;
    if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    const body = (await readJsonObject(req)) as { text?: unknown; occurred_at?: unknown };
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (body.text.length > 10000) {
      return NextResponse.json({ error: 'text too long (max 10000)' }, { status: 400 });
    }
    const OCCURRED_AT_MAX = Date.now() + 365 * 86_400_000;
    const at =
      typeof body.occurred_at === 'number' && body.occurred_at > 0 && body.occurred_at <= OCCURRED_AT_MAX
        ? Math.floor(body.occurred_at)
        : undefined;
    const entry = addManualActivity(id, body.text, at);
    return NextResponse.json({ entry });
  } catch (err) {
    return internalError('collection.activity.POST', err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const bad = validateVnIdOr400(id);
    if (bad) return bad;
    if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    const eid = Number(req.nextUrl.searchParams.get('entry'));
    if (!Number.isInteger(eid) || eid <= 0) {
      return NextResponse.json({ error: 'entry required' }, { status: 400 });
    }
    const ok = deleteActivityForVn(eid, id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('collection.activity.DELETE', err);
  }
}
