import { NextResponse } from 'next/server';
import { findDuplicates } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ groups: findDuplicates() });
}
