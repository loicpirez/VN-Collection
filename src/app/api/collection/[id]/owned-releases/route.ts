import { NextRequest, NextResponse } from 'next/server';
import {
  isInCollection,
  isValidBoxType,
  isValidLocation,
  listOwnedReleasesWithShelfForVn,
  markReleaseOwned,
  unmarkReleaseOwned,
  updateOwnedRelease,
  type OwnedReleasePatch,
} from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';

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
  if ('purchase_place' in body) {
    const v = body.purchase_place;
    if (v === null || v === '') patch.purchase_place = null;
    else if (typeof v === 'string' && v.trim().length > 0) patch.purchase_place = v.trim().slice(0, 200);
    else return { patch, error: 'invalid purchase_place' };
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

/**
 * Release ids accepted by the owned-release endpoints:
 *   - `rNNN`           — VNDB release.
 *   - `synthetic:vN`   — placeholder for VNs without a VNDB release
 *                        (EGS-only entries, or releases not yet
 *                        fan-out-downloaded). The vn_id half mirrors
 *                        the route's :id segment, so a synthetic id
 *                        can only ever be created for its own VN.
 */
function validateReleaseId(raw: string, vnId: string): { ok: boolean; normalized: string } {
  const trimmed = raw.trim();
  if (/^r\d+$/i.test(trimmed)) return { ok: true, normalized: trimmed.toLowerCase() };
  if (trimmed === `synthetic:${vnId}`) return { ok: true, normalized: trimmed };
  return { ok: false, normalized: trimmed };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const owned = listOwnedReleasesWithShelfForVn(id);
  return NextResponse.json({ owned });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validation = validateReleaseId(String(body.release_id ?? ''), id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  markReleaseOwned(id, validation.normalized, patch);
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validation = validateReleaseId(String(body.release_id ?? ''), id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  updateOwnedRelease(id, validation.normalized, patch);
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const validation = validateReleaseId(req.nextUrl.searchParams.get('release_id') ?? '', id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  unmarkReleaseOwned(id, validation.normalized);
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}
