import { NextRequest, NextResponse } from 'next/server';
import { addManualActivity, deleteActivityForVn, isInCollection, listActivityForVn } from '@/lib/db';
import { normalizeVnId, validateVnIdOr400 } from '@/lib/vn-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';
import { validateIsoDate } from '@/lib/input-validators';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id: rawId } = await ctx.params;
    const bad = validateVnIdOr400(rawId);
    if (bad) return bad;
    const id = normalizeVnId(rawId);
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
    const { id: rawId } = await ctx.params;
    const bad = validateVnIdOr400(rawId);
    if (bad) return bad;
    const id = normalizeVnId(rawId);
    if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    const body = (await readJsonObject(req)) as { text?: unknown; occurred_at?: unknown };
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (body.text.length > 10000) {
      return NextResponse.json({ error: 'text too long (max 10000)' }, { status: 400 });
    }
    let at: number | undefined;
    if (body.occurred_at !== undefined) {
      const parsedAt = validateIsoDate(body.occurred_at);
      if (!parsedAt.ok) return NextResponse.json({ error: parsedAt.error }, { status: 400 });
      at = parsedAt.value;
    }
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
    const { id: rawId } = await ctx.params;
    const bad = validateVnIdOr400(rawId);
    if (bad) return bad;
    const id = normalizeVnId(rawId);
    if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    const eid = Number(req.nextUrl.searchParams.get('entry'));
    if (!Number.isSafeInteger(eid) || eid <= 0) {
      return NextResponse.json({ error: 'entry required' }, { status: 400 });
    }
    const ok = deleteActivityForVn(eid, id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('collection.activity.DELETE', err);
  }
}
