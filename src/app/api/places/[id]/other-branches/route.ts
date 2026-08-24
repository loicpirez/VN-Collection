import { NextRequest, NextResponse } from 'next/server';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { internalError } from '@/lib/api-error';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const repository = getPlaceRepository();
    if (!await repository.get(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const branches = await repository.listOtherBranches(id);
    return NextResponse.json({ branches });
  } catch (err) {
    return internalError('places.[id].other-branches.GET', err);
  }
}
