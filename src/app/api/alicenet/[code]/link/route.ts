import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clearAliceNetVnLink, getAliceNetStockItem, setAliceNetVnLink } from '@/lib/db';
import { readJsonObject } from '@/lib/api-body';
import { recordActivity } from '@/lib/activity';
import { isVndbVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Canonical AliceNet stock code shape: three digits, dash, six digits,
 * dash, three digits (`000-000000-000`). Mirrors the row filter in
 * `parseAliceNetHtml` (`lib/alicenet.ts`), the source of every code.
 */
const ALICENET_CODE_RE = /^\d{3}-\d{6}-\d{3}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { code } = await ctx.params;
  if (!ALICENET_CODE_RE.test(code)) {
    return NextResponse.json({ error: 'invalid alicenet code' }, { status: 400 });
  }
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const vnId = body.vn_id;
  if (vnId !== null && (typeof vnId !== 'string' || !isVndbVnId(vnId as string))) {
    return NextResponse.json({ error: 'vn_id must be a valid VNDB VN id or null' }, { status: 400 });
  }
  const item = getAliceNetStockItem(code);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const normalizedVnId = typeof vnId === 'string' ? vnId.toLowerCase() : null;
  setAliceNetVnLink(code, normalizedVnId, normalizedVnId === null ? 'none' : 'manual');
  recordActivity({ kind: 'alicenet.link', entity: 'alicenet_stock', entityId: code, label: item.title, payload: { vn_id: normalizedVnId } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { code } = await ctx.params;
  if (!ALICENET_CODE_RE.test(code)) {
    return NextResponse.json({ error: 'invalid alicenet code' }, { status: 400 });
  }
  clearAliceNetVnLink(code);
  return NextResponse.json({ ok: true });
}
