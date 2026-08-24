import { NextRequest, NextResponse } from 'next/server';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { internalError } from '@/lib/api-error';
import { queryUnassignedBranches } from '@/lib/place-registry-page';

import { PUBLIC_READ_ROUTE, requireOptionalPublicReadAuth } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireOptionalPublicReadAuth(req);
  if (denied) return denied;
  try {
    const params = req.nextUrl.searchParams;
    return NextResponse.json(queryUnassignedBranches(await getPlaceRepository().listUnassignedBranches(), params));
  } catch (err) {
    return internalError('places.unassigned.GET', err);
  }
}
