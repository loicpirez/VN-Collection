import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, setBanner } from '@/lib/db';
import { saveUpload } from '@/lib/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Set the banner from any source.
 *
 * Accepts:
 * - JSON body { source: 'cover' | 'custom_cover' | string-path | url, value?: string }
 *   - 'cover'        → use the local cover (or VNDB image_url fallback)
 *   - 'custom_cover' → use the custom uploaded cover
 *   - 'screenshot'   → expects { value: localPath or url }
 *   - 'release'      → expects { value: localPath or url }
 *   - 'url'          → expects { value: 'https://…' }
 *   - 'path'         → expects { value: relative storage path }
 * - multipart/form-data with `file` → upload custom banner image
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
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'file too large (max 15MB)' }, { status: 400 });
    const path = await saveUpload('vnCover', file, `${id}-banner`);
    setBanner(id, path);
    return NextResponse.json({ item: getCollectionItem(id), banner: path });
  }

  const body = (await req.json().catch(() => ({}))) as { source?: string; value?: string };
  const source = body.source;
  const value = body.value;

  let next: string | null = null;
  if (source === 'cover') {
    next = item.custom_cover || item.local_image || item.image_url || null;
  } else if (source === 'custom_cover') {
    next = item.custom_cover || null;
  } else if (source === 'url' && value) {
    if (!/^https?:\/\//i.test(value)) {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    next = value;
  } else if ((source === 'screenshot' || source === 'release' || source === 'path') && value) {
    // value is either a relative storage path (preferred — local) or a URL
    next = value;
  } else {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  setBanner(id, next);
  return NextResponse.json({ item: getCollectionItem(id), banner: next });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  setBanner(id, null);
  return NextResponse.json({ item: getCollectionItem(id) });
}
