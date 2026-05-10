import { NextRequest, NextResponse } from 'next/server';
import { searchTraits } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  const results = Number(sp.get('results') ?? '50');
  try {
    const traits = await searchTraits(q, { results });
    return NextResponse.json({ traits });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
