import { NextRequest, NextResponse } from 'next/server';
import {
  addGameLogEntry,
  deleteGameLogEntry,
  isInCollection,
  listGameLogForVn,
  updateGameLogEntry,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { validateVnIdOr400 } from '@/lib/vn-id';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
function logGameLogActivity(
  kind: 'collection.game-log-add' | 'collection.game-log-update' | 'collection.game-log-delete',
  id: string,
  label: string,
  minutes: number | null,
  hasNote: boolean,
) {
  try {
    recordActivity({
      kind,
      entity: 'vn',
      entityId: id,
      label,
      payload: { minutes, hasNote },
    });
  } catch (e) {
    console.error(`[game-log:${id}] activity log failed:`, (e as Error).message);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Game log — timestamped free-form notes scoped to a VN. Separate from
 * the activity log (which records state changes); this is where the
 * user writes plot beats / route progress ("started heroine A's
 * route", "chapter 4 finished") with the time they happened.
 *
 * GET    → { entries }
 * POST   { note, logged_at?, session_minutes? } → { entry }
 * PATCH  { id, note?, logged_at?, session_minutes? } → { entry }
 * DELETE ?entry=<id> → { ok: true }
 */
// intentionally public — single-user self-hosted app; game log entries
// reference the operator's own VNs only. Mutating handlers below gated.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ entries: listGameLogForVn(id, 200) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    note?: unknown;
    logged_at?: unknown;
    session_minutes?: unknown;
  };
  if (typeof body.note !== 'string' || body.note.trim().length === 0) {
    return NextResponse.json({ error: 'note required' }, { status: 400 });
  }
  if (body.note.length > 10000) {
    return NextResponse.json({ error: 'note too long (max 10000)' }, { status: 400 });
  }
  const note = body.note.slice(0, 10000);
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const LOGGED_AT_MAX = Date.now() + 365 * 86_400_000;
  const at = typeof body.logged_at === 'number' && body.logged_at > 0 && body.logged_at <= LOGGED_AT_MAX
    ? Math.floor(body.logged_at)
    : undefined;
  const minutes =
    typeof body.session_minutes === 'number' && body.session_minutes > 0
      ? Math.min(Math.floor(body.session_minutes), 100_000)
      : null;
  try {
    const entry = addGameLogEntry(id, note, at, minutes);
    logGameLogActivity('collection.game-log-add', id, 'Added game-log entry', minutes, !!body.note);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('[game-log] addGameLogEntry failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not add entry' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as {
    id?: unknown;
    note?: unknown;
    logged_at?: unknown;
    session_minutes?: unknown;
  };
  const eid = Number(body.id);
  if (!Number.isInteger(eid) || eid <= 0) {
    return NextResponse.json({ error: 'entry id required' }, { status: 400 });
  }
  const patch: { note?: string; logged_at?: number; session_minutes?: number | null } = {};
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 10000);
  const LOGGED_AT_MAX_PATCH = Date.now() + 365 * 86_400_000;
  if (typeof body.logged_at === 'number' && body.logged_at > 0 && body.logged_at <= LOGGED_AT_MAX_PATCH) {
    patch.logged_at = Math.floor(body.logged_at);
  }
  if (body.session_minutes === null) patch.session_minutes = null;
  else if (typeof body.session_minutes === 'number' && body.session_minutes >= 0) {
    patch.session_minutes = body.session_minutes > 0 ? Math.min(Math.floor(body.session_minutes), 100_000) : null;
  }
  try {
    const entry = updateGameLogEntry(eid, patch);
    if (!entry) return NextResponse.json({ error: 'entry not found' }, { status: 404 });
    const minutes =
      patch.session_minutes === undefined
        ? entry.session_minutes ?? null
        : patch.session_minutes ?? null;
    const hasNote = patch.note !== undefined ? !!patch.note : !!entry.note;
    logGameLogActivity('collection.game-log-update', id, 'Updated game-log entry', minutes, hasNote);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('[game-log] updateGameLogEntry failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not update entry' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const eid = Number(req.nextUrl.searchParams.get('entry'));
  if (!Number.isInteger(eid) || eid <= 0) {
    return NextResponse.json({ error: 'entry required' }, { status: 400 });
  }
  const ok = deleteGameLogEntry(eid);
  if (!ok) return NextResponse.json({ error: 'entry not found' }, { status: 404 });
  logGameLogActivity('collection.game-log-delete', id, 'Deleted game-log entry', null, false);
  return NextResponse.json({ ok: true });
}
