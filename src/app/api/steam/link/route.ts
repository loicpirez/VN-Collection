import { NextRequest, NextResponse } from 'next/server';
import { deleteSteamLink, isInCollection, listSteamLinks, setSteamLink } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { isValidVnId, isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateSafeInt, validateText } from '@/lib/input-validators';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ links: listSteamLinks() });
}

/**
 * Body: { vn_id, appid, steam_name }
 *
 * Creates or replaces a manual mapping. Manual links are sticky — a
 * subsequent auto-scan won't overwrite them. Use DELETE to unlink so the
 * auto-scan can re-link it later.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    vn_id?: unknown;
    appid?: unknown;
    steam_name?: unknown;
  };
  if (typeof body.vn_id !== 'string' || !isVndbVnId(body.vn_id)) {
    return NextResponse.json({ error: 'vn_id required (must be a VNDB id)' }, { status: 400 });
  }
  const appidResult = validateSafeInt(body.appid, { field: 'appid', min: 1, max: 4_294_967_295 });
  if (!appidResult.ok) return NextResponse.json({ error: appidResult.error }, { status: 400 });
  const nameResult = validateText(body.steam_name, { field: 'steam_name', max: 200 });
  if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  const vnId = body.vn_id.toLowerCase();
  if (!isInCollection(vnId)) {
    return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  }
  const link = setSteamLink({
    vnId,
    appid: appidResult.value,
    steamName: nameResult.value,
    source: 'manual',
  });
  try {
    recordActivity({
      kind: 'steam.link',
      entity: 'vn',
      entityId: vnId,
      label: 'Pinned Steam app to VN',
      payload: { appid: appidResult.value, source: 'manual' },
    });
  } catch (e) {
    console.error('[steam:link] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ link });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const vnId = req.nextUrl.searchParams.get('vn_id');
  if (!isValidVnId(vnId)) {
    return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
  }
  const normalizedVnId = vnId.toLowerCase();
  const ok = deleteSteamLink(normalizedVnId);
  if (!ok) return NextResponse.json({ error: 'not linked' }, { status: 404 });
  try {
    recordActivity({
      kind: 'steam.unlink',
      entity: 'vn',
      entityId: normalizedVnId,
      label: 'Removed Steam pin',
    });
  } catch (e) {
    console.error('[steam:unlink] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
