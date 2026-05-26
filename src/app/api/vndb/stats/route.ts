import { NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getGlobalStats } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET(): Promise<NextResponse> {
  try {
    const stats = await getGlobalStats();
    return NextResponse.json({ stats });
  } catch (err) {
    return upstreamError('vndb/stats', err);
  }
}
