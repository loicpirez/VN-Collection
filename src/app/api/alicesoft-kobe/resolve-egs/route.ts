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
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? Math.min(20, Math.max(1, Math.floor(body.batch))) : 5;

  const items = listKobeItemsForEgsResolve(batch);
  let processed = 0;
  try {
    for (const item of items) {
      const result = await resolveEgsForVn(item.vn_id, { allowSearch: true });
      if (result.game) {
        setKobeEgsLink(item.code, result.game.id, 'auto', {
          title: result.game.gamename,
          brand: result.game.brand_name,
          releaseDate: result.game.sellday,
          imageUrl: result.game.image_url,
          vndbRaw: result.game.raw?.vndb ?? null,
        });
      } else {
        setKobeEgsLink(item.code, null, 'auto');
      }
      processed++;
    }
  } catch (err) {
    // Sanitize: log details server-side, return a generic JSON error so
    // upstream network/proxy messages don't surface in the response body.
    console.error('[alicesoft-kobe/resolve-egs] upstream error:', (err as Error).message);
    return NextResponse.json({ error: 'upstream error', processed }, { status: 502 });
  }

  const { egs_pending } = countKobeDownloadPending();
  return NextResponse.json({ processed, remaining: egs_pending });
}
