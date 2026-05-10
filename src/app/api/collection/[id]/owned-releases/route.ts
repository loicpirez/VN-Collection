import { NextRequest, NextResponse } from 'next/server';
import { isInCollection, listOwnedReleasesForVn, markReleaseOwned, unmarkReleaseOwned } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const owned = listOwnedReleasesForVn(id);
  return NextResponse.json({ owned });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { release_id?: string; notes?: string | null };
  const releaseId = (body.release_id ?? '').trim();
  if (!/^r\d+$/i.test(releaseId)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  markReleaseOwned(id, releaseId.toLowerCase(), body.notes ?? null);
  return NextResponse.json({ owned: listOwnedReleasesForVn(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const releaseId = (req.nextUrl.searchParams.get('release_id') ?? '').trim();
  if (!/^r\d+$/i.test(releaseId)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  unmarkReleaseOwned(id, releaseId.toLowerCase());
  return NextResponse.json({ owned: listOwnedReleasesForVn(id) });
}
