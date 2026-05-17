import { NextRequest, NextResponse } from 'next/server';
import { getSeries, updateSeries } from '@/lib/db';
import { saveUpload, UnsupportedFileType } from '@/lib/files';
import { recordActivity } from '@/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload a cover or banner for a series. Expects multipart/form-data with:
 *   - file: image (png/jpg/webp), 15MB max
 *   - kind: 'cover' | 'banner'
 *
 * The uploaded file is stored under data/storage/series/ and the relative
 * path written into series.{cover_path|banner_path}. The response includes
 * the publicly-accessible URL ready to drop into <img src>.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!getSeries(sid)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  const file = fd.get('file');
  const kindRaw = fd.get('kind');
  // Explicitly reject unknown kinds instead of silently defaulting
  // to 'cover' — caller bug should surface early.
  if (kindRaw !== 'banner' && kindRaw !== 'cover') {
    return NextResponse.json({ error: 'kind must be banner or cover' }, { status: 400 });
  }
  const kind = kindRaw;
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (max 15MB)' }, { status: 400 });
  }
  let path: string;
  try {
    path = await saveUpload('seriesCover', file, `${sid}-${kind}`);
  } catch (e) {
    if (e instanceof UnsupportedFileType) {
      return NextResponse.json({ error: 'must be an image' }, { status: 400 });
    }
    throw e;
  }
  if (kind === 'banner') updateSeries(sid, { banner_path: path });
  else updateSeries(sid, { cover_path: path });
  try {
    recordActivity({
      kind: 'series.image-upload',
      entity: 'series',
      entityId: String(sid),
      label: `Uploaded series ${kind}`,
      payload: { kind, bytes: file.size },
    });
  } catch (e) {
    console.error(`[series:${sid}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ path });
}
