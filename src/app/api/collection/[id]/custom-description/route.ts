import { NextRequest, NextResponse } from 'next/server';
import { isInCollection, setCustomDescription } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { validateVnIdOr400 } from '@/lib/vn-id';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';

function logActivity(id: string, text: string | null) {
  try {
    recordActivity({
      kind: 'collection.custom-description',
      entity: 'vn',
      entityId: id,
      label: text ? 'Set custom synopsis' : 'Cleared custom synopsis',
      payload: { action: text ? 'set' : 'clear', length: text?.length ?? 0 },
    });
  } catch (e) {
    console.error(`[custom-description:${id}] activity log failed:`, (e as Error).message);
  }
}

async function applyPatch(req: NextRequest, id: string): Promise<NextResponse> {
  const body = (await readJsonObject(req)) as { text?: unknown };
  const raw = body.text;
  if (raw != null && typeof raw !== 'string') {
    return NextResponse.json({ error: 'text must be a string or null' }, { status: 400 });
  }
  const next = (raw as string | null) ?? null;
  try {
    setCustomDescription(id, next);
  } catch (e) {
    console.error(`[custom-description:${id}] DB error:`, (e as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
  logActivity(id, next);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return applyPatch(req, id);
}

/**
 * POST mirrors PATCH for callers that prefer create-style semantics. The
 * underlying write is the same idempotent upsert against
 * `collection.custom_description`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return applyPatch(req, id);
}

/** DELETE clears the per-VN custom synopsis override. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  try {
    setCustomDescription(id, null);
  } catch (e) {
    console.error(`[custom-description:${id}] DB error:`, (e as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
  logActivity(id, null);
  return NextResponse.json({ ok: true });
}
