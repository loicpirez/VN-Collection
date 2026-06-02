import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import {
  deleteUlistEntry,
  fetchUlistEntry,
  fetchUlistLabels,
  patchUlistEntry,
  type UlistPatch,
} from '@/lib/vndb';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_LABEL_IDS = 100;
const MAX_NOTES_LENGTH = 10_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLabelIds(value: unknown): number[] | null {
  if (
    !Array.isArray(value)
    || value.length > MAX_LABEL_IDS
    || value.some((entry) => typeof entry !== 'number' || !Number.isSafeInteger(entry) || entry < 0)
  ) {
    return null;
  }
  return Array.from(new Set(value));
}

function parseNullableDate(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : undefined;
}

/**
 * Tiny route to drive the "VNDB list status" panel on /vn/[id].
 * GET returns the user's current ulist entry + every available label.
 * PATCH mutates labels / vote / dates / notes via `labels_set` + `labels_unset`
 * so anything the user changed elsewhere stays intact.
 * DELETE removes the VN from the list entirely.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const vnId = id.toLowerCase();
  try {
    const labels = await fetchUlistLabels();
    if (typeof labels === 'object' && 'needsAuth' in labels) {
      return NextResponse.json({ needsAuth: true, entry: null, labels: [] });
    }
    const entry = await fetchUlistEntry(vnId);
    if (entry && typeof entry === 'object' && 'needsAuth' in entry) {
      return NextResponse.json({ needsAuth: true, entry: null, labels });
    }
    return NextResponse.json({ entry, labels });
  } catch (e) {
    return upstreamError('vn/[id]/vndb-status', e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const vnId = id.toLowerCase();
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const patch: UlistPatch = {};
  if ('labels_set' in body) {
    const labels = parseLabelIds(body.labels_set);
    if (!labels) return NextResponse.json({ error: 'invalid labels_set' }, { status: 400 });
    patch.labels_set = labels;
  }
  if ('labels_unset' in body) {
    const labels = parseLabelIds(body.labels_unset);
    if (!labels) return NextResponse.json({ error: 'invalid labels_unset' }, { status: 400 });
    patch.labels_unset = labels;
  }
  if ('vote' in body) {
    const v = body.vote;
    if (v === null || v === '') patch.vote = null;
    else if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 10 && v <= 100) patch.vote = v;
    else return NextResponse.json({ error: 'vote must be an integer 10-100 or null' }, { status: 400 });
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
    }
    if (typeof body.notes === 'string' && body.notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json({ error: 'notes too long' }, { status: 400 });
    }
    patch.notes = body.notes || null;
  }
  if ('started' in body) {
    const started = parseNullableDate(body.started);
    if (started === undefined) return NextResponse.json({ error: 'started must be YYYY-MM-DD or null' }, { status: 400 });
    patch.started = started;
  }
  if ('finished' in body) {
    const finished = parseNullableDate(body.finished);
    if (finished === undefined) return NextResponse.json({ error: 'finished must be YYYY-MM-DD or null' }, { status: 400 });
    patch.finished = finished;
  }

  try {
    const r = await patchUlistEntry(vnId, patch);
    if ('needsAuth' in r) return NextResponse.json({ error: 'VNDB token required', code: 'vndb_token_required' }, { status: 401 });
    try {
      recordActivity({
        kind: 'vndb-status.update',
        entity: 'vn',
        entityId: vnId,
        label: 'Updated VNDB ulist entry',
        // Payload carries only field NAMES and label-id counts, never
        // the user's raw notes/vote body — the round-4-followup
        // contract requires this and the test suite pins it.
        payload: {
          changed: Object.keys(patch),
          labels_set_count: patch.labels_set?.length ?? 0,
          labels_unset_count: patch.labels_unset?.length ?? 0,
        },
      });
    } catch (e) {
      console.error(`[vndb-status:${vnId}] activity log failed:`, (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return upstreamError('vn/[id]/vndb-status', e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const vnId = id.toLowerCase();
  try {
    const r = await deleteUlistEntry(vnId);
    if ('needsAuth' in r) return NextResponse.json({ error: 'VNDB token required', code: 'vndb_token_required' }, { status: 401 });
    try {
      recordActivity({
        kind: 'vndb-status.remove',
        entity: 'vn',
        entityId: vnId,
        label: 'Removed VNDB ulist entry',
      });
    } catch (e) {
      console.error(`[vndb-status:${vnId}] activity log failed:`, (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return upstreamError('vn/[id]/vndb-status', e);
  }
}
