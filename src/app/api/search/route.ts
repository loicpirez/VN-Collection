import { NextRequest, NextResponse } from 'next/server';
import { searchVn } from '@/lib/vndb';
import { isInCollectionMany } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ results: [], more: false });
  try {
    const data = await searchVn(q, { results: 30 });
    // Single IN(...) query instead of N round-trips for "is in
    // collection?" lookups. With results: 30 that's 1 SELECT vs 30.
    const ownedIds = isInCollectionMany(data.results.map((v) => v.id));
    const results = data.results.map((v) => ({ ...v, in_collection: ownedIds.has(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
