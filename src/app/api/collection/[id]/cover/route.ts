import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, setCustomCover } from '@/lib/db';
import { saveUpload } from '@/lib/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = getCollectionItem(id);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  const file = fd.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'must be an image' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 });
  const path = await saveUpload('vnCover', file, id);
  setCustomCover(id, path);
  return NextResponse.json({ item: getCollectionItem(id) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  setCustomCover(id, null);
  return NextResponse.json({ item: getCollectionItem(id) });
}
