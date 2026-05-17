import { NextRequest, NextResponse } from 'next/server';
import { getVndbTagHomeTree } from '@/lib/vndb-tag-web-cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  try {
    const tree = await getVndbTagHomeTree({ force });
    return NextResponse.json(tree);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
