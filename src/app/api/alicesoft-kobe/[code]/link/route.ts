import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clearKobeVnLink, getKobeStockItem, setKobeVnLink } from '@/lib/db';
import { readJsonObject } from '@/lib/api-body';
import { recordActivity } from '@/lib/activity';
import { isVndbVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Canonical Alice Kobe stock code shape: three digits, dash, six digits,
 * dash, three digits (`000-000000-000`). Mirrors the row filter in
 * `parseAliceKobeHtml` (`lib/alicesoft-kobe.ts`), the source of every code.
 */
const KOBE_CODE_RE = /^\d{3}-\d{6}-\d{3}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { code } = await ctx.params;
  if (!KOBE_CODE_RE.test(code)) {
    return NextResponse.json({ error: 'invalid kobe code' }, { status: 400 });
  }
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const vnId = body.vn_id;
  if (vnId !== null && (typeof vnId !== 'string' || !isVndbVnId(vnId as string))) {
    return NextResponse.json({ error: 'vn_id must be a valid VNDB VN id or null' }, { status: 400 });
  }
  const item = getKobeStockItem(code);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  setKobeVnLink(code, vnId as string | null, vnId === null ? 'none' : 'manual');
  recordActivity({ kind: 'kobe.link', entity: 'alicesoft_kobe_stock', entityId: code, label: item.title, payload: { vn_id: vnId } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { code } = await ctx.params;
  if (!KOBE_CODE_RE.test(code)) {
    return NextResponse.json({ error: 'invalid kobe code' }, { status: 400 });
  }
  clearKobeVnLink(code);
  return NextResponse.json({ ok: true });
}
