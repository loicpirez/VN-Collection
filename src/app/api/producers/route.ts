import { NextRequest, NextResponse } from 'next/server';
import { getProducerRepository } from '@/lib/db/repositories/producer';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Returns both developer and publisher rankings so a single client
 * fetch covers the two filter dropdowns. The two arrays are sorted
 * independently (each by the count of VNs in the collection where
 * that producer plays the matching role).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const repository = getProducerRepository();
  const [producers, publishers] = await Promise.all([
    repository.listDeveloperStats(),
    repository.listPublisherStats(),
  ]);
  return NextResponse.json({
    producers,
    publishers,
  });
}
