import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getGlobalStats } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Audit S-024: cached, but a LAN burst on the first cache miss
  // still amplifies. Gate to keep the LAN-attack surface honest.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const stats = await getGlobalStats();
    return NextResponse.json({ stats });
  } catch (err) {
    return upstreamError('vndb/stats', err);
  }
}
