import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { listStockAliases, upsertStockAlias, deleteStockAlias } from '@/lib/db';
import { isValidVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Maximum characters per alias term. Anything longer is almost certainly noise. */
export const STOCK_ALIAS_MAX_LENGTH = 100;
/** Maximum number of aliases stored per VN. Prevents query-cost explosion. */
export const STOCK_ALIAS_MAX_COUNT = 20;

function vnAliasTerms(vnId: string): string[] {
  return listStockAliases(vnId).map((row) => row.alias_term);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json({ aliases: vnAliasTerms(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawIdPost } = await ctx.params;
  const id = rawIdPost.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const rawTerm = typeof body.term === 'string' ? body.term : '';
  const term = rawTerm.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!term) return NextResponse.json({ error: 'term required' }, { status: 400 });
  if (term.length > STOCK_ALIAS_MAX_LENGTH) {
    return NextResponse.json({ error: `alias too long (max ${STOCK_ALIAS_MAX_LENGTH} chars)` }, { status: 400 });
  }
  if (term.length < 2) {
    return NextResponse.json({ error: 'alias too short (min 2 chars)' }, { status: 400 });
  }
  const action = body.action;
  if (action !== 'add' && action !== 'delete') {
    return NextResponse.json({ error: 'action must be add or delete' }, { status: 400 });
  }
  if (action === 'delete') {
    deleteStockAlias(id, term);
  } else {
    const current = vnAliasTerms(id);
    if (current.length >= STOCK_ALIAS_MAX_COUNT && !current.includes(term)) {
      return NextResponse.json(
        { error: `too many aliases (max ${STOCK_ALIAS_MAX_COUNT})`, aliases: current },
        { status: 400 },
      );
    }
    upsertStockAlias(id, term);
  }
  return NextResponse.json({ aliases: vnAliasTerms(id) });
}
