import { NextResponse } from 'next/server';
import { listKnownPlaces } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ places: listKnownPlaces() });
}
