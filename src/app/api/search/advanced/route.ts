import { NextRequest, NextResponse } from 'next/server';
import { advancedSearchVn, type AdvancedSearchOptions } from '@/lib/vndb';
import { isInCollectionMany } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: AdvancedSearchOptions;
  try {
    body = (await req.json()) as AdvancedSearchOptions;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  try {
    const data = await advancedSearchVn(body);
    // Single IN(...) lookup instead of one SELECT per result.
    const ownedIds = isInCollectionMany(data.results.map((v) => v.id));
    const results = data.results.map((v) => ({ ...v, in_collection: ownedIds.has(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
