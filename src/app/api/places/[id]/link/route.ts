import { NextRequest, NextResponse } from 'next/server';
import { getPlace, linkProviderToPlace, moveProviderLink, unlinkProviderFromPlace } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';
import { validateSafeInt, validateText } from '@/lib/input-validators';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const body = (await readJsonObject(req)) as { provider_label?: unknown; from_place_id?: unknown };
    const label = validateText(body.provider_label, { field: 'provider_label', max: 200 });
    if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });
    let fromPlaceId: number | null = null;
    if (body.from_place_id !== undefined && body.from_place_id !== null) {
      const parsedFromPlaceId = validateSafeInt(body.from_place_id, { field: 'from_place_id', min: 1, max: Number.MAX_SAFE_INTEGER });
      if (!parsedFromPlaceId.ok) return NextResponse.json({ error: parsedFromPlaceId.error }, { status: 400 });
      fromPlaceId = parsedFromPlaceId.value;
    }
    if (fromPlaceId !== null && fromPlaceId !== id) {
      if (!getPlace(fromPlaceId)) return NextResponse.json({ error: 'from_place not found' }, { status: 404 });
      moveProviderLink(fromPlaceId, id, label.value);
      return NextResponse.json({ ok: true, moved: true });
    }
    linkProviderToPlace(id, label.value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].link.POST', err);
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
    const body = (await readJsonObject(req)) as { provider_label?: unknown };
    const label = validateText(body.provider_label, { field: 'provider_label', max: 200 });
    if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });
    unlinkProviderFromPlace(id, label.value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].link.DELETE', err);
  }
}
