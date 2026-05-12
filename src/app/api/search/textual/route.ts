import { NextRequest, NextResponse } from 'next/server';
import { searchTextual } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json({ hits: searchTextual(q, 50) });
}
