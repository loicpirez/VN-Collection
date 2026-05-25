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
export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? Math.min(20, Math.max(1, Math.floor(body.batch))) : 5;

  const ids = listKobeVnidsToDownload(batch);
  let processed = 0;
  for (const vnId of ids) {
    try {
      const vn = await getVn(vnId);
      if (!vn) throw new Error(`VNDB returned no data for ${vnId}`);
      upsertVn(vn);
      processed++;
    } catch (err) {
      // Stop the run on VNDB/provider errors; otherwise the client keeps
      // polling the same first id and reports progress that cannot advance.
      throw err;
    }
  }

  const { vndb_pending } = countKobeDownloadPending();
  return NextResponse.json({ processed, remaining: vndb_pending });
}
