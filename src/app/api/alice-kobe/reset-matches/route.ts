import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { resetKobeAutoMatches } from '@/lib/alice-kobe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const cleared = resetKobeAutoMatches();
  return NextResponse.json({ cleared });
}
