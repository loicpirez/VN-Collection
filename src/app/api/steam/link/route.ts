import { NextRequest, NextResponse } from 'next/server';
import { deleteSteamLink, isInCollection, listSteamLinks, setSteamLink } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ links: listSteamLinks() });
}

/**
 * Body: { vn_id, appid, steam_name }
 *
 * Creates or replaces a manual mapping. Manual links are sticky — a
 * subsequent auto-scan won't overwrite them. Use DELETE to unlink so the
 * auto-scan can re-link it later.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    vn_id?: unknown;
    appid?: unknown;
    steam_name?: unknown;
  };
  if (typeof body.vn_id !== 'string' || !/^v\d+$/i.test(body.vn_id)) {
    return NextResponse.json({ error: 'vn_id required (must be a VNDB id)' }, { status: 400 });
  }
  if (typeof body.appid !== 'number' || !Number.isInteger(body.appid) || body.appid <= 0) {
    return NextResponse.json({ error: 'appid required' }, { status: 400 });
  }
  if (typeof body.steam_name !== 'string' || body.steam_name.trim().length === 0) {
    return NextResponse.json({ error: 'steam_name required' }, { status: 400 });
  }
  if (!isInCollection(body.vn_id)) {
    return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  }
  const link = setSteamLink({
    vnId: body.vn_id,
    appid: body.appid,
    steamName: body.steam_name,
    source: 'manual',
  });
  return NextResponse.json({ link });
}

export async function DELETE(req: NextRequest) {
  const vnId = req.nextUrl.searchParams.get('vn_id');
  if (!vnId || !/^(v\d+|egs_\d+)$/i.test(vnId)) {
    return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
  }
  const ok = deleteSteamLink(vnId);
  if (!ok) return NextResponse.json({ error: 'not linked' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
