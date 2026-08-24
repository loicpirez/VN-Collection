import { NextRequest, NextResponse } from 'next/server';
import { getActivityRepository } from '@/lib/db/repositories/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  return NextResponse.json({ kinds: await getActivityRepository().listKinds() });
}
