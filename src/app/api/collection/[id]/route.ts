import { NextRequest, NextResponse } from 'next/server';
import {
  addToCollection,
  getCollectionItem,
  isInCollection,
  isValidBoxType,
  isValidEditionType,
  isValidLocation,
  isValidStatus,
  maybePushStatusToVndb,
  removeFromCollection,
  updateCollection,
  upsertVn,
  type CollectionPatch,
} from '@/lib/db';
import { getVn } from '@/lib/vndb';
import { ensureLocalImagesForVn } from '@/lib/assets';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 600;

function pickFields(body: Record<string, unknown>): { fields: CollectionPatch; error?: string } {
  const fields: CollectionPatch = {};
  if ('status' in body) {
    if (!isValidStatus(body.status)) return { fields, error: 'invalid status' };
    fields.status = body.status;
  }
  if ('user_rating' in body) {
    const v = body.user_rating;
    if (v !== null && (typeof v !== 'number' || v < 10 || v > 100)) {
      return { fields, error: 'user_rating must be 10-100 or null' };
    }
    fields.user_rating = v as number | null;
  }
  if ('playtime_minutes' in body) {
    const v = body.playtime_minutes;
    if (typeof v !== 'number' || v < 0) return { fields, error: 'playtime_minutes invalid' };
    fields.playtime_minutes = v;
  }
  if ('started_date' in body) fields.started_date = (body.started_date as string | null) || null;
  if ('finished_date' in body) fields.finished_date = (body.finished_date as string | null) || null;
  if ('notes' in body) fields.notes = (body.notes as string | null) || null;
  if ('favorite' in body) fields.favorite = !!body.favorite;
  if ('location' in body) {
    if (!isValidLocation(body.location)) return { fields, error: 'invalid location' };
    fields.location = body.location;
  }
  if ('edition_type' in body) {
    if (!isValidEditionType(body.edition_type)) return { fields, error: 'invalid edition_type' };
    fields.edition_type = body.edition_type;
  }
  if ('edition_label' in body) fields.edition_label = (body.edition_label as string | null) || null;
  if ('box_type' in body) {
    if (!isValidBoxType(body.box_type)) return { fields, error: 'invalid box_type' };
    fields.box_type = body.box_type;
  }
  if ('download_url' in body) {
    const v = body.download_url;
    if (v == null) {
      fields.download_url = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) {
        fields.download_url = null;
      } else if (trimmed.length > 2000) {
        return { fields, error: 'download_url too long' };
      } else {
        fields.download_url = trimmed;
      }
    } else {
      return { fields, error: 'download_url must be string or null' };
    }
  }
  if ('dumped' in body) {
    fields.dumped = !!body.dumped;
  }
  if ('physical_location' in body) {
    const v = body.physical_location;
    if (v == null) {
      fields.physical_location = [];
    } else if (Array.isArray(v)) {
      if (!v.every((x) => typeof x === 'string')) return { fields, error: 'physical_location entries must be strings' };
      fields.physical_location = v.map((s) => (s as string).trim()).filter((s): s is string => s.length > 0).slice(0, 32);
    } else if (typeof v === 'string') {
      fields.physical_location = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 32);
    } else {
      return { fields, error: 'physical_location must be array or string' };
    }
  }
  return { fields };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = getCollectionItem(id);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ item, in_collection: !!item.status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const wasInCollection = isInCollection(id);
  if (!getCollectionItem(id)) {
    try {
      const vn = await getVn(id);
      if (!vn) return NextResponse.json({ error: 'VN not found' }, { status: 404 });
      upsertVn(vn);
      // Pull every staff + VA's full profile so the credit pages aren't
      // half-empty after adding this VN. Fire-and-forget; cached 30 days.
      void downloadFullStaffForVn(vn.id).catch(() => {});
      void downloadFullCharForVn(vn.id).catch(() => {});
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { fields, error } = pickFields(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  addToCollection(id, fields);
  await maybePushStatusToVndb(id, fields.status);
  // First-time add: download cover + screenshots + release/package images locally.
  // Failures are silently swallowed — the user can retry via the "Download all" button.
  if (!wasInCollection) {
    try {
      await ensureLocalImagesForVn(id);
    } catch (err) {
      console.error(`auto-download failed for ${id}:`, (err as Error).message);
    }
  }
  return NextResponse.json({ item: getCollectionItem(id) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { fields, error } = pickFields(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  updateCollection(id, fields);
  // Best-effort write-back to VNDB. Awaiting it would tie the route's
  // latency to api.vndb.org; we fire and forget but await so any auth
  // error surfaces in the dev log (the helper itself never throws).
  await maybePushStatusToVndb(id, fields.status);
  return NextResponse.json({ item: getCollectionItem(id) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  removeFromCollection(id);
  return NextResponse.json({ ok: true });
}
