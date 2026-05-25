import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clearKobeVnLink, getKobeStockItem, setKobeVnLink } from '@/lib/db';
import { readJsonObject } from '@/lib/api-body';
import { recordActivity } from '@/lib/activity';
import { isVndbVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const code = params.code;
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

export async function DELETE(req: NextRequest, { params }: { params: { code: string } }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const code = params.code;
  clearKobeVnLink(code);
  return NextResponse.json({ ok: true });
}
