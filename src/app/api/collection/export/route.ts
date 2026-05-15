import { NextResponse } from 'next/server';
import { exportData } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  // Export contains every collection row (PII: notes, ratings,
  // timestamps). Gate behind localhost / admin token.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const payload = exportData();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="vndb-collection-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
