import { NextRequest, NextResponse } from 'next/server';
import {
  addToReadingQueue,
  isInCollection,
  listReadingQueue,
  removeFromReadingQueue,
  reorderReadingQueue,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ entries: listReadingQueue() });
  } catch (err) {
    return internalError('reading-queue.GET', err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const body = (await readJsonObject(req)) as { vn_id?: unknown };
    if (typeof body.vn_id !== 'string' || !isValidVnId(body.vn_id)) {
      return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
    }
    const vnId = normalizeVnId(body.vn_id);
    if (!isInCollection(vnId)) {
      return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
    }
    const entry = addToReadingQueue(vnId);
    recordActivity({ kind: 'reading_queue.add', entity: 'vn', entityId: vnId, label: 'Added to reading queue' });
    return NextResponse.json({ entry });
  } catch (err) {
    return internalError('reading-queue.POST', err);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const vnId = req.nextUrl.searchParams.get('vn_id');
    if (!isValidVnId(vnId)) {
      return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
    }
    const normalizedVnId = normalizeVnId(vnId);
    const ok = removeFromReadingQueue(normalizedVnId);
    if (!ok) return NextResponse.json({ error: 'not in queue' }, { status: 404 });
    recordActivity({ kind: 'reading_queue.remove', entity: 'vn', entityId: normalizedVnId, label: 'Removed from reading queue' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('reading-queue.DELETE', err);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const body = (await readJsonObject(req)) as { ids?: unknown };
    if (
      !Array.isArray(body.ids) ||
      body.ids.length > 1000 ||
      body.ids.some((x) => typeof x !== 'string' || !isValidVnId(x))
    ) {
      return NextResponse.json({ error: 'ids array of VN ids required (max 1000)' }, { status: 400 });
    }
    const ids = (body.ids as string[]).map(normalizeVnId);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 });
    }
    reorderReadingQueue(ids);
    recordActivity({ kind: 'reading_queue.reorder', entity: 'reading_queue', label: 'Reordered reading queue', payload: { ids } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('reading-queue.PATCH', err);
  }
}
