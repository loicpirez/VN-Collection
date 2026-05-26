import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listStockAliases, upsertStockAlias, deleteStockAlias } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function vnAliasTerms(vnId: string): string[] {
  return listStockAliases(vnId).map((row) => row.alias_term);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json({ aliases: vnAliasTerms(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const term = typeof body.term === 'string' ? body.term.trim() : '';
  if (!term) return NextResponse.json({ error: 'term required' }, { status: 400 });
  const action = body.action;
  if (action === 'delete') {
    deleteStockAlias(id, term);
  } else {
    upsertStockAlias(id, term);
  }
  return NextResponse.json({ aliases: vnAliasTerms(id) });
}
