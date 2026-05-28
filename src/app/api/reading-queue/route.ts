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
export const dynamic = 'force-dynamic';

// intentionally public — single-user self-hosted app; read-only queue
// data carries no PII. Mutating handlers below remain gated.
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
    if (typeof body.vn_id !== 'string' || !/^(v\d+|egs_\d+)$/i.test(body.vn_id)) {
      return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
    }
    if (!isInCollection(body.vn_id)) {
      return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
    }
    const entry = addToReadingQueue(body.vn_id);
    recordActivity({ kind: 'reading_queue.add', entity: 'vn', entityId: body.vn_id, label: 'Added to reading queue' });
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
    if (!vnId || !/^(v\d+|egs_\d+)$/i.test(vnId)) {
      return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
    }
    const ok = removeFromReadingQueue(vnId);
    if (!ok) return NextResponse.json({ error: 'not in queue' }, { status: 404 });
    recordActivity({ kind: 'reading_queue.remove', entity: 'vn', entityId: vnId, label: 'Removed from reading queue' });
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
      body.ids.some((x) => typeof x !== 'string' || !/^(v\d+|egs_\d+)$/i.test(x as string))
    ) {
      return NextResponse.json({ error: 'ids array of VN ids required (max 1000)' }, { status: 400 });
    }
    reorderReadingQueue(body.ids as string[]);
    recordActivity({ kind: 'reading_queue.reorder', entity: 'reading_queue', label: 'Reordered reading queue', payload: { ids: body.ids } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('reading-queue.PATCH', err);
  }
}
