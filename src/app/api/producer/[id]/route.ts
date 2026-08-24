import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getProducerRepository } from '@/lib/db/repositories/producer';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { VNDB_CACHE_MS, isCacheFresh } from '@/lib/cache-age';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const repository = getProducerRepository();
  const cached = await repository.get(id);
  if (cached && isCacheFresh(cached.fetched_at, VNDB_CACHE_MS)) {
    return NextResponse.json({ producer: cached });
  }
  try {
    const fresh = await fetchProducer(id);
    if (!fresh) {
      if (cached) return NextResponse.json({ producer: cached });
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    await repository.upsert(fresh);
    return NextResponse.json({ producer: await repository.get(id) });
  } catch (err) {
    if (cached) return NextResponse.json({ producer: cached, warning: 'fetch failed; using cached data' });
    return upstreamError('producer/[id]', err);
  }
}
