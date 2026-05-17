import { NextRequest, NextResponse } from 'next/server';
import {
  getCollectionItem,
  normalizeRotation,
  setBanner,
  setBannerPosition,
  setBannerRotation,
} from '@/lib/db';
import { saveUpload, UnsupportedFileType } from '@/lib/files';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import { validateVnIdOr400 } from '@/lib/vn-id';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSITION_RE = /^-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%$/;

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
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  const item = getCollectionItem(id);
  if (!item) return NextResponse.json({ error: 'not in collection' }, { status: 404 });

  const ct = req.headers.get('content-type') ?? '';

  if (ct.startsWith('multipart/form-data')) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'file too large (max 15MB)' }, { status: 400 });
    }
    let path: string;
    try {
      path = await saveUpload('vnCover', file, `${id}-banner`);
    } catch (e) {
      if (e instanceof UnsupportedFileType) {
        return NextResponse.json({ error: 'must be an image' }, { status: 400 });
      }
      throw e;
    }
    setBanner(id, path);
    recordActivity({ kind: 'banner.set', entity: 'vn', entityId: id, label: 'Uploaded banner', payload: { source: 'upload' } });
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
    // SSRF guard — matches the cover route. Only known image hosts.
    if (!isAllowedHttpTarget(value)) {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    next = value;
  } else if ((source === 'screenshot' || source === 'release' || source === 'path') && value) {
    // value is either a relative storage path (preferred — local) or a URL.
    // Reject paths trying to escape the storage root.
    if (/(^|\/)\.\.(\/|$)/.test(value) || value.includes('\0')) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 });
    }
    next = value;
  } else {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  setBanner(id, next);
  recordActivity({ kind: 'banner.set', entity: 'vn', entityId: id, label: 'Set banner', payload: { source } });
  return NextResponse.json({ item: getCollectionItem(id), banner: next });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!getCollectionItem(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    position?: string | null;
    rotation?: unknown;
  };
  // The PATCH route now accepts EITHER `position` (focal-point edit)
  // OR `rotation` (degrees). Both can coexist in a single body so the
  // banner adjust UI can flip rotation and crop in one round-trip.
  const hasPosition = 'position' in body;
  const hasRotation = 'rotation' in body;
  if (!hasPosition && !hasRotation) {
    return NextResponse.json({ error: 'missing position or rotation' }, { status: 400 });
  }
  if (hasPosition) {
    const value = body.position;
    if (value !== null && (typeof value !== 'string' || !POSITION_RE.test(value))) {
      return NextResponse.json({ error: 'position must be "X% Y%" or null' }, { status: 400 });
    }
    setBannerPosition(id, value ?? null);
    recordActivity({ kind: 'banner.position', entity: 'vn', entityId: id, label: 'Updated banner position', payload: { position: value ?? null } });
  }
  if (hasRotation) {
    if (typeof body.rotation !== 'number' || !Number.isFinite(body.rotation)) {
      return NextResponse.json({ error: 'rotation must be a number' }, { status: 400 });
    }
    const next = normalizeRotation(body.rotation);
    setBannerRotation(id, next);
    recordActivity({ kind: 'banner.rotate', entity: 'vn', entityId: id, label: 'Rotated banner', payload: { rotation: next } });
  }
  return NextResponse.json({ item: getCollectionItem(id) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!getCollectionItem(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  setBanner(id, null);
  setBannerPosition(id, null);
  // Rotation is metadata on the active banner image. Wipe on reset
  // so a fresh upload doesn't inherit a stale 90deg flag.
  setBannerRotation(id, 0);
  recordActivity({ kind: 'banner.reset', entity: 'vn', entityId: id, label: 'Reset banner' });
  return NextResponse.json({ item: getCollectionItem(id) });
}
