import { NextRequest, NextResponse } from 'next/server';
import { searchTags } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  const cat = sp.get('category') ?? undefined;
  const results = Number(sp.get('results') ?? '50');
  try {
    const tags = await searchTags(q, { results, category: cat });
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
