import { NextRequest, NextResponse } from 'next/server';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { internalError } from '@/lib/api-error';

import { PUBLIC_READ_ROUTE, requireOptionalPublicReadAuth } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireOptionalPublicReadAuth(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ map: await getPlaceRepository().providerMap() });
  } catch (err) {
    return internalError('places.provider-map.GET', err);
  }
}
