import { NextResponse } from 'next/server';
import { listActivityKinds } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ kinds: listActivityKinds() });
}

