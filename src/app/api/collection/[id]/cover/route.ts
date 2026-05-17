import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, setCustomCover, setCoverRotation, normalizeRotation } from '@/lib/db';
import { saveUpload, UnsupportedFileType } from '@/lib/files';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import { validateVnIdOr400 } from '@/lib/vn-id';
import { recordActivity } from '@/lib/activity';

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
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 });
    }
    let path: string;
    try {
      // saveUpload now sniffs magic bytes; the client's
      // Content-Type can no longer slip an HTML/SVG file in.
      path = await saveUpload('vnCover', file, id);
    } catch (e) {
      if (e instanceof UnsupportedFileType) {
        return NextResponse.json({ error: 'must be an image' }, { status: 400 });
      }
      throw e;
    }
    setCustomCover(id, path);
    recordActivity({ kind: 'cover.set', entity: 'vn', entityId: id, label: 'Uploaded cover', payload: { source: 'upload' } });
    return NextResponse.json({ item: getCollectionItem(id), cover: path });
  }

  const body = (await req.json().catch(() => ({}))) as { source?: string; value?: string };
  const source = body.source;
  const value = body.value;

  let next: string | null = null;
  if (source === 'url' && value) {
    // SSRF guard: the URL ends up rendered as an <img src> back to
    // the user AND (when proxied through /api/egs-cover) fetched
    // server-side. Only allowlisted hosts survive — no loopback /
    // private-IP / non-image hosts.
    if (!isAllowedHttpTarget(value)) {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    next = value;
  } else if ((source === 'screenshot' || source === 'release' || source === 'path') && value) {
    // Reject any path that tries to escape STORAGE_ROOT (..) or
    // contains URL-encoding tricks. The /api/files/[...path] route
    // checks again at read time, but normalizing here keeps the
    // stored value clean too.
    if (/(^|\/)\.\.(\/|$)/.test(value) || value.includes('\0')) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 });
    }
    next = value;
  } else {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  setCustomCover(id, next);
  recordActivity({ kind: 'cover.set', entity: 'vn', entityId: id, label: 'Set cover', payload: { source } });
  return NextResponse.json({ item: getCollectionItem(id), cover: next });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  // Fail loudly when the row isn't in collection — consistent with
  // other DELETE routes and avoids masking stale optimistic UI.
  if (!getCollectionItem(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  setCustomCover(id, null);
  // Rotation is metadata on the cover. Resetting the cover wipes the
  // rotation too so the user doesn't have to chase a stale 90deg flag
  // back to 0 manually after picking a fresh image.
  setCoverRotation(id, 0);
  recordActivity({ kind: 'cover.reset', entity: 'vn', entityId: id, label: 'Reset cover' });
  return NextResponse.json({ item: getCollectionItem(id) });
}

/**
 * PATCH only mutates rotation. The body must contain `rotation` set
 * to 0/90/180/270 (degrees clockwise). Out-of-spec values are
 * normalised to 0 by the storage helper rather than rejected, so
 * the route never 400s on an honest typo from the UI sliders.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!getCollectionItem(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { rotation?: unknown };
  if (typeof body.rotation !== 'number' || !Number.isFinite(body.rotation)) {
    return NextResponse.json({ error: 'rotation must be a number' }, { status: 400 });
  }
  const next = normalizeRotation(body.rotation);
  setCoverRotation(id, next);
  recordActivity({ kind: 'cover.rotate', entity: 'vn', entityId: id, label: 'Rotated cover', payload: { rotation: next } });
  return NextResponse.json({ item: getCollectionItem(id), rotation: next });
}
