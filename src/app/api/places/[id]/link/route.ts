import { NextRequest, NextResponse } from 'next/server';
import { getPlace, linkProviderToPlace, unlinkProviderFromPlace } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const body = (await readJsonObject(req)) as { provider_label?: unknown };
    if (typeof body.provider_label !== 'string' || !body.provider_label.trim()) {
      return NextResponse.json({ error: 'provider_label required' }, { status: 400 });
    }
    linkProviderToPlace(id, body.provider_label.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].link.POST', err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const body = (await readJsonObject(req)) as { provider_label?: unknown };
    if (typeof body.provider_label !== 'string' || !body.provider_label.trim()) {
      return NextResponse.json({ error: 'provider_label required' }, { status: 400 });
    }
    unlinkProviderFromPlace(id, body.provider_label.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('places.[id].link.DELETE', err);
  }
}
