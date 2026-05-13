import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/download-status';
import { getVndbThrottleStats } from '@/lib/vndb-throttle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    throttle: getVndbThrottleStats(),
    jobs: listJobs(),
  });
}
