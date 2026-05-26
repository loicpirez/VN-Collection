import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchStaff } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ staff: [] });
  try {
    const staff = await searchStaff(q);
    return NextResponse.json({ staff });
  } catch (err) {
    return upstreamError('staff', err);
  }
}
