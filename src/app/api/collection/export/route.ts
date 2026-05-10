import { NextResponse } from 'next/server';
import { exportData } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
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
