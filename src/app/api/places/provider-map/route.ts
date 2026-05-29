import { NextResponse } from 'next/server';
import { getPlaceProviderMap } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// intentionally public — single-user self-hosted app, collection metadata
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ map: getPlaceProviderMap() });
  } catch (err) {
    return internalError('places.provider-map.GET', err);
  }
}
