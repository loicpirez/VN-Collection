import { NextRequest, NextResponse } from 'next/server';
import { listListsForVn } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json({ lists: listListsForVn(id) });
}
