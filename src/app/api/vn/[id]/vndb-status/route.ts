import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import {
  deleteUlistEntry,
  fetchUlistEntry,
  fetchUlistLabels,
  patchUlistEntry,
  type UlistPatch,
  type VndbUlistEntryDetail,
} from '@/lib/vndb';
import { recordActivity } from '@/lib/activity';
import type { CollectionPatch } from '@/lib/db';
import type { CollectionUserDataSnapshot } from '@/lib/types';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import {
  compareVndbUserData,
  decodeVndbSyncSelections,
  normalizeVndbSyncText,
  statusFromVndbLabels,
  VNDB_STATUS_LABELS,
  type LocalVndbUserData,
  type RemoteVndbUserData,
  type VndbSyncField,
  type VndbUserDataDifference,
} from '@/lib/vndb-user-data-sync';

import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { createRequestDeadline } from '@/lib/request-deadline';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_LABEL_IDS = 100;
const MAX_NOTES_LENGTH = 10_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localUserData(item: Awaited<ReturnType<ReturnType<typeof getVnReadRepository>['getCollectionItem']>>): LocalVndbUserData | null {
  if (!item?.status) return null;
  return {
    status: item.status,
    vote: item.user_rating ?? null,
    started: item.started_date ?? null,
    finished: item.finished_date ?? null,
    notes: normalizeVndbSyncText(item.notes),
  };
}

function remoteUserData(entry: VndbUlistEntryDetail | null): RemoteVndbUserData {
  return {
    status: statusFromVndbLabels(entry?.labels ?? []),
    vote: entry?.vote ?? null,
    started: entry?.started ?? null,
    finished: entry?.finished ?? null,
    notes: normalizeVndbSyncText(entry?.notes),
  };
}

function buildRemotePatch(local: LocalVndbUserData, fields: VndbSyncField[]): UlistPatch {
  const patch: UlistPatch = {};
  if (fields.includes('status') && local.status) {
    const target = VNDB_STATUS_LABELS[local.status];
    patch.labels_set = [target];
    patch.labels_unset = Object.values(VNDB_STATUS_LABELS).filter((label) => label !== target);
  }
  if (fields.includes('vote')) patch.vote = local.vote;
  if (fields.includes('started')) patch.started = local.started;
  if (fields.includes('finished')) patch.finished = local.finished;
  if (fields.includes('notes')) patch.notes = local.notes;
  return patch;
}

function buildLocalPatch(remote: RemoteVndbUserData, fields: VndbSyncField[]): CollectionPatch {
  const patch: CollectionPatch = {};
  if (fields.includes('status') && remote.status) patch.status = remote.status;
  if (fields.includes('vote')) patch.user_rating = remote.vote;
  if (fields.includes('started')) patch.started_date = remote.started;
  if (fields.includes('finished')) patch.finished_date = remote.finished;
  if (fields.includes('notes')) patch.notes = remote.notes;
  return patch;
}

function buildLocalExpectation(
  local: LocalVndbUserData,
  fields: VndbSyncField[],
): Partial<CollectionUserDataSnapshot> {
  const expected: Partial<CollectionUserDataSnapshot> = {};
  if (fields.includes('status') && local.status) expected.status = local.status;
  if (fields.includes('vote')) expected.user_rating = local.vote;
  if (fields.includes('started')) expected.started_date = local.started;
  if (fields.includes('finished')) expected.finished_date = local.finished;
  if (fields.includes('notes')) expected.notes = local.notes;
  return expected;
}

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
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const vnId = id.toLowerCase();
  const deadline = createRequestDeadline(req.signal);
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const [labels, entry, item] = await Promise.all([
      fetchUlistLabels(deadline.signal),
      fetchUlistEntry(vnId, { fresh, signal: deadline.signal }),
      getVnReadRepository().getCollectionItem(vnId),
    ]);
    if (typeof labels === 'object' && 'needsAuth' in labels) {
      return NextResponse.json({ needsAuth: true, entry: null, labels: [] });
    }
    if (entry && typeof entry === 'object' && 'needsAuth' in entry) {
      return NextResponse.json({ needsAuth: true, entry: null, labels });
    }
    const local = localUserData(item);
    const remote = remoteUserData(entry);
    return NextResponse.json({
      entry,
      labels,
      local,
      differences: local && remote ? compareVndbUserData(local, remote) : [],
    });
  } catch (e) {
    return upstreamError('vn/[id]/vndb-status', e);
  } finally {
    deadline.dispose();
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const vnId = id.toLowerCase();
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const direction = body.direction;
  const selections = decodeVndbSyncSelections(body.selections);
  if ((direction !== 'local_to_vndb' && direction !== 'vndb_to_local') || !selections) {
    return NextResponse.json({ error: 'invalid sync request' }, { status: 400 });
  }
  const fields = selections.map((selection) => selection.field);

  try {
    const initialLocal = localUserData(await getVnReadRepository().getCollectionItem(vnId));
    if (!initialLocal) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
    const entry = await fetchUlistEntry(vnId, { fresh: true });
    if (entry && typeof entry === 'object' && 'needsAuth' in entry) {
      return NextResponse.json({ error: 'VNDB token required', code: 'vndb_token_required' }, { status: 401 });
    }
    const local = localUserData(await getVnReadRepository().getCollectionItem(vnId));
    if (!local) {
      return NextResponse.json({ error: 'selected fields changed since preview', code: 'vndb_sync_changed' }, { status: 409 });
    }
    const remote = remoteUserData(entry);
    const differences = compareVndbUserData(local, remote);
    const differencesByField = new Map(differences.map((difference) => [difference.field, difference]));
    const selected: VndbUserDataDifference[] = [];
    for (const selection of selections) {
      const current = differencesByField.get(selection.field);
      if (!current || current.local !== selection.local || current.remote !== selection.remote) {
        return NextResponse.json({ error: 'selected fields changed since preview', code: 'vndb_sync_changed' }, { status: 409 });
      }
      selected.push(current);
    }
    const allowed = direction === 'local_to_vndb'
      ? selected.every((difference) => difference.canPushLocal)
      : selected.every((difference) => difference.canPullRemote);
    if (!allowed) {
      return NextResponse.json({ error: 'selected sync direction is not available', code: 'vndb_sync_direction_unavailable' }, { status: 409 });
    }

    if (direction === 'local_to_vndb') {
      const result = await patchUlistEntry(vnId, buildRemotePatch(local, fields));
      if ('needsAuth' in result) {
        return NextResponse.json({ error: 'VNDB token required', code: 'vndb_token_required' }, { status: 401 });
      }
    } else {
      const applied = await getCollectionCoreRepository().updateUserDataIfCurrent(
        vnId,
        buildLocalExpectation(local, fields),
        buildLocalPatch(remote, fields),
      );
      if (!applied) {
        return NextResponse.json({ error: 'selected fields changed since preview', code: 'vndb_sync_changed' }, { status: 409 });
      }
    }
    try {
      await recordActivity({
        kind: 'vndb.data.resolve',
        entity: 'vn',
        entityId: vnId,
        label: 'Resolved VNDB data differences',
        payload: { direction, fields },
      });
    } catch (activityError) {
      console.error(`[vndb-status:${vnId}] activity log failed:`, (activityError as Error).message);
    }
    return NextResponse.json({ ok: true, direction, fields });
  } catch (error) {
    return upstreamError('vn/[id]/vndb-status/sync', error);
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
      await recordActivity({
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
      await recordActivity({
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
