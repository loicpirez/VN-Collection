import { NextRequest, NextResponse } from 'next/server';
import { getPlace, updatePlace, deletePlace } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';
import { hasFiniteCoordinates } from '@/lib/place-coordinates';
import { validateText } from '@/lib/input-validators';
import { parseOptionalPlaceKind, parseOptionalPlaceText, parseOptionalPlaceUrl } from '@/lib/place-input';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

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
    const existing = getPlace(id);
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const body = (await readJsonObject(req)) as Record<string, unknown>;
    if (
      ('lat' in body && body.lat !== null && typeof body.lat !== 'number')
      || ('lng' in body && body.lng !== null && typeof body.lng !== 'number')
    ) {
      return NextResponse.json({ error: 'lat and lng must be numbers or null' }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if ('name' in body) {
      const name = validateText(body.name, { field: 'name', max: 200 });
      if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
      patch.name = name.value;
    }
    const nameJa = parseOptionalPlaceText(body.name_ja, 'name_ja', 200);
    if (!nameJa.ok) return NextResponse.json({ error: nameJa.error }, { status: 400 });
    if ('name_ja' in body) patch.name_ja = nameJa.value;
    const kind = parseOptionalPlaceKind(body.kind);
    if (!kind.ok) return NextResponse.json({ error: kind.error }, { status: 400 });
    if ('kind' in body) patch.kind = kind.value;
    const address = parseOptionalPlaceText(body.address, 'address', 1000);
    if (!address.ok) return NextResponse.json({ error: address.error }, { status: 400 });
    if ('address' in body) patch.address = address.value;
    if ('lat' in body) patch.lat = typeof body.lat === 'number' ? body.lat : null;
    if ('lng' in body) patch.lng = typeof body.lng === 'number' ? body.lng : null;
    const url = parseOptionalPlaceUrl(body.url);
    if (!url.ok) return NextResponse.json({ error: url.error }, { status: 400 });
    if ('url' in body) patch.url = url.value;
    const notes = parseOptionalPlaceText(body.notes, 'notes', 10_000);
    if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });
    if ('notes' in body) patch.notes = notes.value;
    if ('lat' in patch || 'lng' in patch) {
      const coordinates = {
        lat: 'lat' in patch && (typeof patch.lat === 'number' || patch.lat === null) ? patch.lat : existing.lat,
        lng: 'lng' in patch && (typeof patch.lng === 'number' || patch.lng === null) ? patch.lng : existing.lng,
      };
      const hasAnyCoordinate = coordinates.lat != null || coordinates.lng != null;
      if (hasAnyCoordinate && !hasFiniteCoordinates(coordinates)) {
        return NextResponse.json({ error: 'valid lat and lng required together' }, { status: 400 });
      }
    }
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
