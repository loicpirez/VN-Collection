import { NextResponse } from 'next/server';
import { pullStatusesFromVndb } from '@/lib/vndb-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pull every status-bearing ulist entry from the authenticated user's VNDB
 * list and align local statuses to match. One-way (VNDB → local). Only VNs
 * already present in the local collection are touched.
 */
export async function POST() {
  const result = await pullStatusesFromVndb();
  const status = result.ok ? 200 : result.needsAuth ? 401 : 500;
  return NextResponse.json(result, { status });
}
