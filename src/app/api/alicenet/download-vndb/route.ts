import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listAliceNetVnidsToDownload, countAliceNetDownloadPending, upsertVn } from '@/lib/db';
import { getVn } from '@/lib/vndb';
import { parseAliceNetBatch } from '@/lib/alicenet-route-input';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Downloads VNDB metadata for alicenet-matched VNs that are not yet in the
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
  const parsedBatch = parseAliceNetBatch(body.batch, 5, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const batch = parsedBatch.value;

  const ids = listAliceNetVnidsToDownload(batch);
  let processed = 0;
  try {
    for (const vnId of ids) {
      const vn = await getVn(vnId);
      if (!vn) throw new Error(`VNDB returned no data for ${vnId}`);
      upsertVn(vn);
      processed++;
    }
  } catch (err) {
    console.error('[alicenet/download-vndb] upstream error:', (err as Error).message);
    const response = aliceNetApiError(err, 'VNDB metadata download failed.', 502);
    const body = await response.json() as { error: string };
    return NextResponse.json({ ...body, processed }, { status: 502 });
  }

  const { vndb_pending } = countAliceNetDownloadPending();
  return NextResponse.json({ processed, remaining: vndb_pending });
}
