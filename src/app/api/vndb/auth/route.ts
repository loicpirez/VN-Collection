import { NextResponse } from 'next/server';
import { getAuthInfo } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const info = await getAuthInfo();
  if (!info) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, ...info });
}
