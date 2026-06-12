import { NextResponse } from 'next/server';
import { listUnassignedBranches } from '@/lib/db';
import { internalError } from '@/lib/api-error';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ branches: listUnassignedBranches() });
  } catch (err) {
    return internalError('places.unassigned.GET', err);
  }
}
