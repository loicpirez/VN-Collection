import { NextResponse } from 'next/server';
import { findStaleVns } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ rows: findStaleVns() });
}
