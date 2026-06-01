import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { resetAliceNetAutoMatches } from '@/lib/alicenet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const cleared = resetAliceNetAutoMatches();
  return NextResponse.json({ cleared });
}
