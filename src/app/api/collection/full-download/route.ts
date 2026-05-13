import { NextRequest, NextResponse } from 'next/server';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';
import { downloadFullProducerForVn } from '@/lib/producer-full';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

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
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { vn_ids?: unknown };
  if (!Array.isArray(body.vn_ids)) {
    return NextResponse.json({ error: 'vn_ids must be an array' }, { status: 400 });
  }
  const ids = body.vn_ids.filter(
    (s): s is string => typeof s === 'string' && /^v\d+$/i.test(s),
  );
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

  return NextResponse.json({ ok: true, queued: ids.length }, { status: 202 });
}
