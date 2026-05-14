import { NextResponse } from 'next/server';
import { listProducerStats, listPublisherStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Returns both developer and publisher rankings so a single client
 * fetch covers the two filter dropdowns. The two arrays are sorted
 * independently (each by the count of VNs in the collection where
 * that producer plays the matching role).
 */
export async function GET() {
  return NextResponse.json({
    producers: listProducerStats(),
    publishers: listPublisherStats(),
  });
}
