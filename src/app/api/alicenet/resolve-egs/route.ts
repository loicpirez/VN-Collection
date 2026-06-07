import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listAliceNetItemsForEgsResolve, countAliceNetDownloadPending, setAliceNetEgsLink } from '@/lib/db';
import { resolveEgsForVn } from '@/lib/erogamescape';
import { parseAliceNetBatch } from '@/lib/alicenet-route-input';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Resolves EGS game data for alicenet items that have a vn_id but no egs_id.
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
  const parsedBatch = parseAliceNetBatch(body.batch, 5, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const batch = parsedBatch.value;

  const items = listAliceNetItemsForEgsResolve(batch);
  let processed = 0;
  try {
    for (const item of items) {
      const result = await resolveEgsForVn(item.vn_id, { allowSearch: true });
      if (result.game) {
        setAliceNetEgsLink(item.code, result.game.id, 'auto', {
          title: result.game.gamename,
          brand: result.game.brand_name,
          releaseDate: result.game.sellday,
          imageUrl: result.game.image_url,
          vndbRaw: result.game.raw?.vndb ?? null,
        });
      } else {
        setAliceNetEgsLink(item.code, null, 'auto');
      }
      processed++;
    }
  } catch (err) {
    console.error('[alicenet/resolve-egs] upstream error:', (err as Error).message);
    const response = aliceNetApiError(err, 'EGS resolution failed.', 502);
    const body = await response.json() as { error: string };
    return NextResponse.json({ ...body, processed }, { status: 502 });
  }

  const { egs_pending } = countAliceNetDownloadPending();
  return NextResponse.json({ processed, remaining: egs_pending });
}
