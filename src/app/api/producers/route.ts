import { NextResponse } from 'next/server';
import { listProducerStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ producers: listProducerStats() });
}
