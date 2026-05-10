import { NextRequest, NextResponse } from 'next/server';
import { searchStaff } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ staff: [] });
  try {
    const staff = await searchStaff(q);
    return NextResponse.json({ staff });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
