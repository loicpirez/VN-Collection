import { NextRequest, NextResponse } from 'next/server';
import { getPlace, listVnsAtPlace } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// intentionally public — single-user self-hosted app, collection metadata
export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const vns = listVnsAtPlace(id);
    return NextResponse.json({ vns });
  } catch (err) {
    return internalError('places.[id].stock.GET', err);
  }
}
