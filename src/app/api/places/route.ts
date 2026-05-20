import { NextRequest, NextResponse } from 'next/server';
import { listKnownPlaces } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  return NextResponse.json({ places: listKnownPlaces() });
}
