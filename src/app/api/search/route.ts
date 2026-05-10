import { NextRequest, NextResponse } from 'next/server';
import { searchVn } from '@/lib/vndb';
import { isInCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ results: [], more: false });
  try {
    const data = await searchVn(q, { results: 30 });
    const results = data.results.map((v) => ({ ...v, in_collection: isInCollection(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
