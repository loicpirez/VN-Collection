import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getVn } from '@/lib/vndb';
import { getCollectionItem, upsertVn } from '@/lib/db';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';
import { downloadFullProducerForVn } from '@/lib/producer-full';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

const CACHE_MS = 24 * 3600 * 1000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  // Restrict to the two id shapes the rest of the app actually
  // produces. Without this gate a caller could burn VNDB rate-limit
  // budget by firing arbitrary strings at the upstream API.
  if (!/^(v\d+|egs_\d+)$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const cached = getCollectionItem(id);
  if (cached && cached.fetched_at && Date.now() - cached.fetched_at < CACHE_MS) {
    return NextResponse.json({ vn: cached, in_collection: !!cached.status });
  }
  try {
    const vn = await getVn(id);
    if (!vn) return NextResponse.json({ error: 'not found' }, { status: 404 });
    upsertVn(vn);
    // Fire-and-forget: pull the full profile + credit history for every
    // staff member / VA / developer this VN credits. Each fan-out
    // registers a tracked job (see lib/download-status.ts) so progress
    // and errors surface in the UI instead of vanishing silently.
    void downloadFullStaffForVn(vn.id).catch((e) => {
      console.error(`[vn:${vn.id}] staff fan-out failed:`, (e as Error).message);
    });
    void downloadFullCharForVn(vn.id).catch((e) => {
      console.error(`[vn:${vn.id}] character fan-out failed:`, (e as Error).message);
    });
    void downloadFullProducerForVn(vn.id).catch((e) => {
      console.error(`[vn:${vn.id}] producer fan-out failed:`, (e as Error).message);
    });
    const item = getCollectionItem(vn.id);
    return NextResponse.json({ vn: item, in_collection: !!item?.status });
  } catch (err) {
    return upstreamError('vn/[id]', err);
  }
}
