import { NextRequest, NextResponse } from 'next/server';
import {
  isInCollection,
  isValidBoxType,
  isValidLocation,
  listOwnedReleasesForVn,
  markReleaseOwned,
  unmarkReleaseOwned,
  updateOwnedRelease,
  type OwnedReleasePatch,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_CONDITIONS = new Set(['new', 'used', 'sealed', 'opened', 'damaged']);

function pickPatch(body: Record<string, unknown>): { patch: OwnedReleasePatch; error?: string } {
  const patch: OwnedReleasePatch = {};
  if ('notes' in body) patch.notes = (body.notes as string | null) || null;
  if ('location' in body) {
    if (!isValidLocation(body.location)) return { patch, error: 'invalid location' };
    patch.location = body.location;
  }
  if ('box_type' in body) {
    if (!isValidBoxType(body.box_type)) return { patch, error: 'invalid box_type' };
    patch.box_type = body.box_type;
  }
  if ('edition_label' in body) patch.edition_label = (body.edition_label as string | null) || null;
  if ('condition' in body) {
    const v = body.condition;
    if (v === null || v === '') patch.condition = null;
    else if (typeof v === 'string' && VALID_CONDITIONS.has(v)) patch.condition = v;
    else return { patch, error: 'invalid condition' };
  }
  if ('price_paid' in body) {
    const v = body.price_paid;
    if (v === null || v === '') patch.price_paid = null;
    else if (typeof v === 'number' && v >= 0) patch.price_paid = v;
    else return { patch, error: 'price_paid must be a non-negative number or null' };
  }
  if ('currency' in body) {
    const v = body.currency;
    if (v === null || v === '') patch.currency = null;
    else if (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v)) patch.currency = v.toUpperCase();
    else return { patch, error: 'currency must be a 3-letter code or null' };
  }
  if ('acquired_date' in body) {
    const v = body.acquired_date;
    if (v === null || v === '') patch.acquired_date = null;
    else if (typeof v === 'string') patch.acquired_date = v;
    else return { patch, error: 'invalid acquired_date' };
  }
  if ('dumped' in body) patch.dumped = !!body.dumped;
  if ('physical_location' in body) {
    const v = body.physical_location;
    if (v == null) patch.physical_location = [];
    else if (Array.isArray(v)) {
      if (!v.every((x) => typeof x === 'string')) return { patch, error: 'physical_location entries must be strings' };
      patch.physical_location = v
        .map((s) => (s as string).trim())
        .filter((s): s is string => s.length > 0)
        .slice(0, 32);
    } else if (typeof v === 'string') {
      patch.physical_location = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 32);
    } else {
      return { patch, error: 'physical_location must be array or string' };
    }
  }
  return { patch };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const owned = listOwnedReleasesForVn(id);
  return NextResponse.json({ owned });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const releaseId = String(body.release_id ?? '').trim();
  if (!/^r\d+$/i.test(releaseId)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  markReleaseOwned(id, releaseId.toLowerCase(), patch);
  return NextResponse.json({ owned: listOwnedReleasesForVn(id) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const releaseId = String(body.release_id ?? '').trim();
  if (!/^r\d+$/i.test(releaseId)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  updateOwnedRelease(id, releaseId.toLowerCase(), patch);
  return NextResponse.json({ owned: listOwnedReleasesForVn(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const releaseId = (req.nextUrl.searchParams.get('release_id') ?? '').trim();
  if (!/^r\d+$/i.test(releaseId)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  unmarkReleaseOwned(id, releaseId.toLowerCase());
  return NextResponse.json({ owned: listOwnedReleasesForVn(id) });
}
