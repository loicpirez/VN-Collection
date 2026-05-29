import { NextRequest, NextResponse } from 'next/server';
import { getPlace, listBranchesAtOtherPlaces } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const branches = listBranchesAtOtherPlaces(id);
    return NextResponse.json({ branches });
  } catch (err) {
    return internalError('places.[id].other-branches.GET', err);
  }
}
