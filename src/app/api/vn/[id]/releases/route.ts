import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getReleasesForVn } from '@/lib/vndb';
import { getOwnedReleaseRepository } from '@/lib/db/repositories/owned-release';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { isValidVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const releases = await getReleasesForVn(id, 50, req.signal);
    await Promise.all(releases.map((release) => getOwnedReleaseRepository().upsertResolutionCache({
      releaseId: release.id,
      vnId: id,
      resolution: release.resolution,
    })));
    return NextResponse.json({ releases });
  } catch (err) {
    return upstreamError('vn/[id]/releases', err);
  }
}
