import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { getFullDownloadQueueStore } from '@/lib/db/repositories/full-download-queue';
import { wakeFullDownloadWorkers } from '@/lib/full-download-worker';
import { sanitizeUnknownError } from '@/lib/error-sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const VN_IDS_MAX = 200;

/**
 * Selective full-download: queue a staff + character + producer fan-out
 * for each VN in the supplied list, bypassing the global `vndb_fanout`
 * toggle (the user is explicitly opting in for these ids).
 *
 * Returns 202 with `{ queued: N }` after durable insertion. Active VN rows are
 * deduplicated and expired worker leases resume from their last completed
 * phase after restart.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const body = (await readJsonObject(req)) as { vn_ids?: unknown };
  if (!Array.isArray(body.vn_ids)) {
    return NextResponse.json({ error: 'vn_ids must be an array' }, { status: 400 });
  }
  if (body.vn_ids.length > VN_IDS_MAX) {
    return NextResponse.json(
      { error: `vn_ids exceeds limit of ${VN_IDS_MAX}` },
      { status: 429 },
    );
  }
  if (body.vn_ids.some((s) => typeof s !== 'string' || !isVndbVnId(s))) {
    return NextResponse.json({ error: 'vn_ids must contain only VNDB VN ids' }, { status: 400 });
  }
  const ids = Array.from(new Set((body.vn_ids as string[]).map((id) => id.toLowerCase())));
  if (ids.length === 0) {
    return NextResponse.json({ queued: 0 });
  }

  let queued: number;
  try {
    queued = await getFullDownloadQueueStore().enqueue(ids, Date.now());
  } catch (error) {
    console.error('[full-download] durable enqueue failed:', sanitizeUnknownError(error));
    return NextResponse.json(
      { error: 'full download queue unavailable', code: 'queue_unavailable' },
      { status: 503 },
    );
  }
  await recordActivity({
    kind: 'download.full',
    entity: 'collection',
    entityId: 'selected',
    label: 'Full data download',
    payload: { count: queued, vn_ids: ids },
  });
  wakeFullDownloadWorkers();

  return NextResponse.json({ ok: true, queued }, { status: 202 });
}
