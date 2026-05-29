import { NextRequest, NextResponse } from 'next/server';
import { getPlace, updatePlace, deletePlace } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// intentionally public — single-user self-hosted app, collection metadata
export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const place = getPlace(id);
    if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ place });
  } catch (err) {
    return internalError('places.[id].GET', err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const body = (await readJsonObject(req)) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ('name' in body && typeof body.name === 'string') patch.name = body.name.trim();
    if ('name_ja' in body) patch.name_ja = typeof body.name_ja === 'string' ? body.name_ja.trim() || null : null;
    if ('address' in body) patch.address = typeof body.address === 'string' ? body.address.trim() || null : null;
    if ('lat' in body) patch.lat = typeof body.lat === 'number' ? body.lat : null;
    if ('lng' in body) patch.lng = typeof body.lng === 'number' ? body.lng : null;
    if ('url' in body) patch.url = typeof body.url === 'string' ? body.url.trim() || null : null;
    if ('notes' in body) patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    updatePlace(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].PATCH', err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    deletePlace(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].DELETE', err);
  }
}
