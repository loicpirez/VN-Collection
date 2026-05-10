import { NextRequest, NextResponse } from 'next/server';
import {
  addToCollection,
  getCollectionItem,
  isInCollection,
  isValidEditionType,
  isValidLocation,
  isValidStatus,
  removeFromCollection,
  updateCollection,
  upsertVn,
  type CollectionPatch,
} from '@/lib/db';
import { getVn } from '@/lib/vndb';
import { ensureLocalImagesForVn } from '@/lib/assets';

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
  if ('physical_location' in body) {
    const v = body.physical_location;
    if (v !== null && typeof v !== 'string') return { fields, error: 'physical_location must be string or null' };
    fields.physical_location = v && v.trim() ? v.trim().slice(0, 200) : null;
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
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { fields, error } = pickFields(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  addToCollection(id, fields);
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
  return NextResponse.json({ item: getCollectionItem(id) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  removeFromCollection(id);
  return NextResponse.json({ ok: true });
}
