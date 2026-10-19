import { NextRequest, NextResponse } from 'next/server';
import { fetchProducerAssociations } from '@/lib/producer-associations';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Revalidate producer credits while retaining the last usable cache on failure.
 * @param req Authenticated local or trusted-proxy request.
 * @param ctx Producer identity from the route.
 * @returns Fresh/stale counters, or an explicit failure for incomplete walks.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid producer id' }, { status: 400 });
  }
  const result = await fetchProducerAssociations(id, { forceRefresh: true });
  // Distinguish "VNDB really has no credits for this producer" from
  // "every upstream call we tried threw". Without this signal the
  // refresh toast claimed success ("0 dev, 0 pub") during VNDB
  // outages and the user mistook the empty result for the truth.
  if (result.upstreamFailed) {
    return NextResponse.json(
      { ok: false, error: 'VNDB unavailable', upstreamFailed: true, code: 'vndb_unavailable' },
      { status: 502 },
    );
  }
  try {
    await recordActivity({
      kind: 'producer.refresh',
      entity: 'producer',
      entityId: id,
      label: 'Refreshed producer associations',
      payload: {
        developers: result.developerVns.length,
        publishers: result.publisherVns.length,
        stale: result.stale,
      },
    });
  } catch (e) {
    console.error(`[producer:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({
    ok: true,
    developers: result.developerVns.length,
    publishers: result.publisherVns.length,
    owned: result.ownedUnique,
    // True when at least one of the two paginated walks fell back
    // to the stale cache because the live VNDB call threw. The
    // toast surfaces a "served stale" hint so the user knows the
    // counts may be out of date and can retry.
    stale: result.stale,
  });
}
