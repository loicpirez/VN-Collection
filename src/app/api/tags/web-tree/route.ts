import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getVndbTagHomeTree } from '@/lib/vndb-tag-web-cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const force = req.nextUrl.searchParams.get('force') === '1';
  try {
    const tree = await getVndbTagHomeTree({ force });
    return NextResponse.json(tree);
  } catch (err) {
    return upstreamError('tags/web-tree', err);
  }
}
