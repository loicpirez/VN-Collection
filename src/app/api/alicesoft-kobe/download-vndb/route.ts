import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listKobeVnidsToDownload, countKobeDownloadPending, upsertVn } from '@/lib/db';
import { getVn } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Downloads VNDB metadata for kobe-matched VNs that are not yet in the
 * local `vn` table. Must run before `resolve-egs` so resolveEgsForVn
 * can use the VN's title/alttitle and release ext-links for EGS lookup.
 *
 * Body: { batch?: number }
 * Returns: { processed, remaining }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? Math.min(20, Math.max(1, Math.floor(body.batch))) : 5;

  const ids = listKobeVnidsToDownload(batch);
  let processed = 0;
  try {
    for (const vnId of ids) {
      const vn = await getVn(vnId);
      if (!vn) throw new Error(`VNDB returned no data for ${vnId}`);
      upsertVn(vn);
      processed++;
    }
  } catch (err) {
    // Sanitize: log details server-side, return a generic JSON error so
    // upstream network/proxy messages don't surface in the response body.
    console.error('[alicesoft-kobe/download-vndb] upstream error:', (err as Error).message);
    return NextResponse.json({ error: 'upstream error', processed }, { status: 502 });
  }

  const { vndb_pending } = countKobeDownloadPending();
  return NextResponse.json({ processed, remaining: vndb_pending });
}
