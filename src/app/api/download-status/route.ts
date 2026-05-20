import { NextRequest, NextResponse } from 'next/server';
import { listJobs } from '@/lib/download-status';
import { enrichJobs } from '@/lib/download-status-names';
import { getVndbThrottleStats } from '@/lib/vndb-throttle';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  return NextResponse.json({
    throttle: getVndbThrottleStats(),
    jobs: enrichJobs(listJobs()),
  });
}
