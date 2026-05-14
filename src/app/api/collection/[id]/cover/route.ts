import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, setCustomCover } from '@/lib/db';
import { saveUpload } from '@/lib/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Set the custom cover for a VN.
 *
 * Accepts:
 * - JSON body { source: 'screenshot' | 'release' | 'url' | 'path', value: string }
 *   - 'screenshot' / 'release' / 'path' → local storage path (preferred)
 *   - 'url' → fully-qualified https URL
 * - multipart/form-data with `file` → upload a custom cover image (max 10MB)
 *
 * Mirrors the /banner endpoint so the user can pick any image already
 * known to the VN (screenshot, release art, full VNDB cover, EGS cover)
 * as the cover without leaving the page.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = getCollectionItem(id);
  if (!item) return NextResponse.json({ error: 'not in collection' }, { status: 404 });

  const ct = req.headers.get('content-type') ?? '';

  if (ct.startsWith('multipart/form-data')) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'must be an image' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 });
    const path = await saveUpload('vnCover', file, id);
    setCustomCover(id, path);
    return NextResponse.json({ item: getCollectionItem(id), cover: path });
  }

  const body = (await req.json().catch(() => ({}))) as { source?: string; value?: string };
  const source = body.source;
  const value = body.value;

  let next: string | null = null;
  if (source === 'url' && value) {
    if (!/^https?:\/\//i.test(value)) {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    next = value;
  } else if ((source === 'screenshot' || source === 'release' || source === 'path') && value) {
    next = value;
  } else {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  setCustomCover(id, next);
  return NextResponse.json({ item: getCollectionItem(id), cover: next });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  setCustomCover(id, null);
  return NextResponse.json({ item: getCollectionItem(id) });
}
