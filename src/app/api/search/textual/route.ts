import { NextRequest, NextResponse } from 'next/server';
import { searchTextual } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Q_MAX = 300;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX);
  return NextResponse.json({ hits: searchTextual(q, 50) });
}
