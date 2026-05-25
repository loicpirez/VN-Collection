import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listKobeItemsForEgsResolve, countKobeDownloadPending, setKobeEgsLink } from '@/lib/db';
import { resolveEgsForVn } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Resolves EGS game data for kobe items that have a vn_id but no egs_id.
 * Uses `resolveEgsForVn` which first checks VNDB release ext-links then
 * falls back to name search — far more accurate than raw-title search.
 * Run AFTER `download-vndb` so the local `vn` table has title/alttitle.
 *
 * Body: { batch?: number }
 * Returns: { processed, remaining }
 */
export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? Math.min(20, Math.max(1, Math.floor(body.batch))) : 5;

  const items = listKobeItemsForEgsResolve(batch);
  let processed = 0;
  for (const item of items) {
    try {
      const result = await resolveEgsForVn(item.vn_id, { allowSearch: true });
      if (result.game) {
        setKobeEgsLink(item.code, result.game.id, 'auto');
      } else {
        setKobeEgsLink(item.code, null, 'auto');
      }
      processed++;
    } catch (err) {
      // Stop the run on provider/network errors; otherwise the client keeps
      // polling the same first row and shows progress that cannot advance.
      throw err;
    }
  }

  const { egs_pending } = countKobeDownloadPending();
  return NextResponse.json({ processed, remaining: egs_pending });
}
