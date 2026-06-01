import { NextRequest, NextResponse } from 'next/server';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';
import { downloadFullProducerForVn } from '@/lib/producer-full';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const VN_IDS_MAX = 200;

/**
 * Selective full-download: queue a staff + character + producer fan-out
 * for each VN in the supplied list, bypassing the global `vndb_fanout`
 * toggle (the user is explicitly opting in for these ids).
 *
 * Returns 202 with `{ queued: N }` and runs the actual fan-outs in the
 * background. The DownloadStatusBar surfaces per-job progress and the
 * existing throttle (1 req/s, per-request Retry-After, soft circuit on
 * 3+ 429s) keeps the rate sane no matter how many VNs were picked.
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

  for (const vnId of ids) {
    void downloadFullStaffForVn(vnId, { force: true }).catch((e) => {
      console.error(`[full-download:${vnId}] staff:`, (e as Error).message);
    });
    void downloadFullCharForVn(vnId, { force: true }).catch((e) => {
      console.error(`[full-download:${vnId}] characters:`, (e as Error).message);
    });
    void downloadFullProducerForVn(vnId, { force: true }).catch((e) => {
      console.error(`[full-download:${vnId}] producers:`, (e as Error).message);
    });
  }
  recordActivity({
    kind: 'download.full',
    entity: 'collection',
    entityId: 'selected',
    label: 'Full data download',
    payload: { count: ids.length, vn_ids: ids },
  });

  return NextResponse.json({ ok: true, queued: ids.length }, { status: 202 });
}
