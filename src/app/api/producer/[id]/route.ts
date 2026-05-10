import { NextRequest, NextResponse } from 'next/server';
import { getProducer as getProducerLocal, upsertProducer } from '@/lib/db';
import { getProducer as fetchProducer } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
const CACHE_MS = 24 * 3600 * 1000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const cached = getProducerLocal(id);
  if (cached && Date.now() - cached.fetched_at < CACHE_MS) {
    return NextResponse.json({ producer: cached });
  }
  try {
    const fresh = await fetchProducer(id);
    if (!fresh) {
      if (cached) return NextResponse.json({ producer: cached });
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    upsertProducer(fresh);
    return NextResponse.json({ producer: getProducerLocal(id) });
  } catch (err) {
    if (cached) return NextResponse.json({ producer: cached, warning: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
