import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getReleasesForVn } from '@/lib/vndb';
import { upsertReleaseResolutionCache } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Audit S-028: gate — VNDB POST /release on miss.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const releases = await getReleasesForVn(id);
    for (const rel of releases) {
      // Bind the release back to its VN so aspect-ratio filters can
      // match without an `owned_release` row.
      upsertReleaseResolutionCache({ releaseId: rel.id, vnId: id, resolution: rel.resolution });
    }
    return NextResponse.json({ releases });
  } catch (err) {
    return upstreamError('vn/[id]/releases', err);
  }
}
