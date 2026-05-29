import { NextRequest, NextResponse } from 'next/server';
import { findStaleVns } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  return NextResponse.json({ rows: findStaleVns() });
}
