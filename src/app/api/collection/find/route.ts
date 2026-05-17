import { NextRequest, NextResponse } from 'next/server';
import { searchCollectionByTitle } from '@/lib/steam';

export const dynamic = 'force-dynamic';

/**
 * Lightweight title lookup against the in-collection VNs. Used by the
 * /steam manual-link UI; can be reused anywhere we need a quick fuzzy
 * "search the library" affordance.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json({ matches: searchCollectionByTitle(q, 12) });
}
