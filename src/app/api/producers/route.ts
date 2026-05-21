import { NextRequest, NextResponse } from 'next/server';
import { listProducerStats, listPublisherStats } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

/**
 * Returns both developer and publisher rankings so a single client
 * fetch covers the two filter dropdowns. The two arrays are sorted
 * independently (each by the count of VNs in the collection where
 * that producer plays the matching role).
 */
export async function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  return NextResponse.json({
    producers: listProducerStats(),
    publishers: listPublisherStats(),
  });
}
