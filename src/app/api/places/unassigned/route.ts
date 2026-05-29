import { NextResponse } from 'next/server';
import { listUnassignedBranches } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ branches: listUnassignedBranches() });
  } catch (err) {
    return internalError('places.unassigned.GET', err);
  }
}
