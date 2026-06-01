import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  isInCollection,
  isValidBoxType,
  isValidLocation,
  listOwnedReleasesWithShelfForVn,
  markReleaseOwned,
  materializeReleaseMetaForVn,
  setOwnedReleaseAspectOverride,
  unmarkReleaseOwned,
  updateOwnedRelease,
  type OwnedReleasePatch,
} from '@/lib/db';
import { isAspectKey } from '@/lib/aspect-ratio';
import { isVndbVnId, normalizeVnId, validateVnIdOr400 } from '@/lib/vn-id';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { parsePhysicalLocations } from '@/lib/physical-location-input';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_CONDITIONS = new Set(['new', 'used', 'sealed', 'opened', 'damaged']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AspectOverrideInput = {
  width?: number | null;
  height?: number | null;
  aspectKey?: Parameters<typeof setOwnedReleaseAspectOverride>[0]['aspectKey'];
  note?: string | null;
};

function parseAspectOverride(raw: unknown): { value?: AspectOverrideInput | null; error?: string } {
  if (raw === null) return { value: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'invalid aspect_override' };
  const obj = raw as Record<string, unknown>;
  const width = obj.width;
  const height = obj.height;
  const hasWidth = width != null;
  const hasHeight = height != null;
  if (hasWidth !== hasHeight) return { error: 'aspect_override width and height are required together' };
  if (
    hasWidth
    && (
      typeof width !== 'number'
      || !Number.isSafeInteger(width)
      || width <= 0
      || width > 100_000
      || typeof height !== 'number'
      || !Number.isSafeInteger(height)
      || height <= 0
      || height > 100_000
    )
  ) {
    return { error: 'aspect_override dimensions must be positive integers' };
  }
  const aspectKey = obj.aspect_key;
  if (aspectKey != null && (!isAspectKey(aspectKey) || aspectKey === 'unknown')) {
    return { error: 'invalid aspect_override aspect_key' };
  }
  const note = obj.note;
  if (note != null && typeof note !== 'string') return { error: 'aspect_override note must be a string or null' };
  if (typeof note === 'string' && note.length > 500) return { error: 'aspect_override note too long (max 500)' };
  if (!hasWidth && aspectKey == null) return { error: 'aspect_override requires dimensions or aspect_key' };
  return {
    value: {
      width: hasWidth ? width as number : null,
      height: hasHeight ? height as number : null,
      aspectKey: isAspectKey(aspectKey) ? aspectKey : null,
      note: typeof note === 'string' ? note : null,
    },
  };
}

function pickPatch(body: Record<string, unknown>): { patch: OwnedReleasePatch; error?: string } {
  const patch: OwnedReleasePatch = {};
  if ('notes' in body) {
    const v = body.notes;
    if (v != null && typeof v !== 'string') return { patch, error: 'notes must be a string or null' };
    if (typeof v === 'string' && v.length > 10_000) return { patch, error: 'notes too long (max 10000)' };
    patch.notes = (v as string | null) || null;
  }
  if ('location' in body) {
    if (!isValidLocation(body.location)) return { patch, error: 'invalid location' };
    patch.location = body.location;
  }
  if ('box_type' in body) {
    if (!isValidBoxType(body.box_type)) return { patch, error: 'invalid box_type' };
    patch.box_type = body.box_type;
  }
  if ('edition_label' in body) {
    const v = body.edition_label;
    if (v != null && typeof v !== 'string') return { patch, error: 'edition_label must be a string or null' };
    if (typeof v === 'string' && v.length > 200) return { patch, error: 'edition_label too long (max 200)' };
    patch.edition_label = (v as string | null) || null;
  }
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
    else if (typeof v === 'string' && ISO_DATE_RE.test(v)) patch.acquired_date = v;
    else return { patch, error: 'invalid acquired_date' };
  }
  if ('purchase_place' in body) {
    const v = body.purchase_place;
    if (v === null || v === '') patch.purchase_place = null;
    else if (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200) patch.purchase_place = v.trim();
    else return { patch, error: 'invalid purchase_place' };
  }
  if ('owned_platform' in body) {
    const v = body.owned_platform;
    if (v === null || v === '') patch.owned_platform = null;
    else if (typeof v === 'string' && /^[a-z0-9]{1,16}$/i.test(v.trim())) {
      // Lowercase to match release_meta_cache.platforms entries
      // exactly. VNDB occasionally adds new platform codes (xss,
      // xbo, swi…) so we trust the format check rather than
      // hardcoding a whitelist.
      patch.owned_platform = v.trim().toLowerCase();
    } else {
      return { patch, error: 'invalid owned_platform' };
    }
  }
  if ('dumped' in body) {
    if (typeof body.dumped !== 'boolean') return { patch, error: 'dumped must be boolean' };
    patch.dumped = body.dumped;
  }
  if ('physical_location' in body) {
    const locations = parsePhysicalLocations(body.physical_location);
    if (!locations.ok) return { patch, error: locations.error };
    patch.physical_location = locations.value;
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const owned = listOwnedReleasesWithShelfForVn(id);
  return NextResponse.json({ owned });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const validation = validateReleaseId(String(body.release_id ?? ''), id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  markReleaseOwned(id, validation.normalized, patch);
  recordActivity({
    kind: 'owned_release.add',
    entity: 'owned_release',
    entityId: `${id}:${validation.normalized}`,
    label: 'Added owned edition',
    payload: { vn_id: id, release_id: validation.normalized, ...patch },
  });
  // Pull cached release rows into `release_meta_cache` so the shelf
  // popover has rel_* data on the very next page load. Without this,
  // adding an edition from `/release/[id]` or the EditionPicker
  // leaves `release_meta_cache` empty until the user happens to
  // visit `/vn/[id]` for that VN — and the popover keeps showing
  // the "Unknown platform — refresh releases" branch in the
  // meantime. Idempotent + cheap; falls through cleanly when
  // `POST /release` was never cached (synthetic ids, brand-new VN).
  if (isVndbVnId(id)) {
    try {
      materializeReleaseMetaForVn(id);
    } catch {
      // Best-effort — adding the owned-release row already
      // succeeded; the materialize step is an optimization, not a
      // correctness requirement. The shelf popover's refresh
      // button still works as a fallback.
    }
  }
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const validation = validateReleaseId(String(body.release_id ?? ''), id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const { patch, error } = pickPatch(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const aspectOverride = 'aspect_override' in body ? parseAspectOverride(body.aspect_override) : null;
  if (aspectOverride?.error) return NextResponse.json({ error: aspectOverride.error }, { status: 400 });
  db.transaction(() => {
    updateOwnedRelease(id, validation.normalized, patch);
    if (!aspectOverride) return;
    if (aspectOverride.value === null) {
      setOwnedReleaseAspectOverride({ vnId: id, releaseId: validation.normalized, aspectKey: 'unknown' });
      return;
    }
    setOwnedReleaseAspectOverride({
      vnId: id,
      releaseId: validation.normalized,
      ...aspectOverride.value,
    });
  })();
  recordActivity({
    kind: 'owned_release.update',
    entity: 'owned_release',
    entityId: `${id}:${validation.normalized}`,
    label: 'Updated owned edition',
    payload: { vn_id: id, release_id: validation.normalized, ...patch },
  });
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const validation = validateReleaseId(req.nextUrl.searchParams.get('release_id') ?? '', id);
  if (!validation.ok) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  unmarkReleaseOwned(id, validation.normalized);
  recordActivity({
    kind: 'owned_release.remove',
    entity: 'owned_release',
    entityId: `${id}:${validation.normalized}`,
    label: 'Removed owned edition',
    payload: { vn_id: id, release_id: validation.normalized },
  });
  return NextResponse.json({ owned: listOwnedReleasesWithShelfForVn(id) });
}
