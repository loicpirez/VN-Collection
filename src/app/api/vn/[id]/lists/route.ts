import { NextRequest, NextResponse } from 'next/server';
import { listListsForVn } from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  return NextResponse.json({ lists: listListsForVn(id) });
}
