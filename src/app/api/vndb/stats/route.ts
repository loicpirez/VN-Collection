import { NextResponse } from 'next/server';
import { getGlobalStats } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  try {
    const stats = await getGlobalStats();
    return NextResponse.json({ stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
