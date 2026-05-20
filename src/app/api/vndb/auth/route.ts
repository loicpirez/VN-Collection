import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfo } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const info = await getAuthInfo();
  if (!info) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, ...info });
}
