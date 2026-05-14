import { NextResponse } from 'next/server';
import { fetchProducerAssociations, invalidateProducerAssociations } from '@/lib/producer-associations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Bust the cached developer + publisher associations for a producer,
 * then re-fetch from VNDB so the next render of `/producer/[id]` shows
 * fresh data. Used by the per-page Refresh button on the producer
 * detail page — the global refresh endpoint doesn't cover producer
 * associations because the cache key is per-page (paginated) and
 * different from the cache keys covered by `/api/refresh/global`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid producer id' }, { status: 400 });
  }
  invalidateProducerAssociations(id);
  const result = await fetchProducerAssociations(id);
  return NextResponse.json({
    ok: true,
    developers: result.developerVns.length,
    publishers: result.publisherVns.length,
    owned: result.ownedUnique,
  });
}
