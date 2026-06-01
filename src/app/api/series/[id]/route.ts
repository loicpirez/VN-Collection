import { NextRequest, NextResponse } from 'next/server';
import { deleteSeries, getSeries, updateSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateText } from '@/lib/input-validators';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const s = getSeries(n);
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ series: s });
}

/**
 * Storage paths the UI serves through `/api/files/<path>` — restricted
 * to the conventional bucket-relative shape `<bucket>/<filename>` so
 * a forged PATCH can't store a value that looks like `..` or `/etc/...`
 * even though the file-read route checks again at fetch time.
 */
function isValidStoragePath(p: unknown): p is string | null {
  if (p === null) return true;
  if (typeof p !== 'string') return false;
  if (p.length === 0) return true;
  if (p.length > 200) return false;
  if (p.includes('..') || p.includes('\0')) return false;
  return /^[A-Za-z0-9._/-]+$/.test(p);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    description?: unknown;
    cover_path?: string | null;
    banner_path?: string | null;
  };
  const patch: {
    name?: string;
    description?: string | null;
    cover_path?: string | null;
    banner_path?: string | null;
  } = {};
  if ('name' in body) {
    const nameResult = validateText(body.name, { field: 'name', max: 200 });
    if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
    patch.name = nameResult.value;
  }
  if ('description' in body) {
    if (body.description == null) {
      patch.description = null;
    } else {
      const descResult = validateText(body.description, { field: 'description', max: 20000, allowEmpty: true });
      if (!descResult.ok) return NextResponse.json({ error: descResult.error }, { status: 400 });
      patch.description = descResult.value;
    }
  }
  if ('cover_path' in body) {
    if (!isValidStoragePath(body.cover_path)) {
      return NextResponse.json({ error: 'invalid cover_path' }, { status: 400 });
    }
    patch.cover_path = body.cover_path;
  }
  if ('banner_path' in body) {
    if (!isValidStoragePath(body.banner_path)) {
      return NextResponse.json({ error: 'invalid banner_path' }, { status: 400 });
    }
    patch.banner_path = body.banner_path;
  }
  const s = updateSeries(n, patch);
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    recordActivity({
      kind: 'series.update',
      entity: 'series',
      entityId: String(n),
      label: 'Updated series',
      payload: { changed: Object.keys(patch) },
    });
  } catch (e) {
    console.error(`[series:${n}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ series: getSeries(n) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const existing = getSeries(n);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  deleteSeries(n);
  try {
    recordActivity({
      kind: 'series.delete',
      entity: 'series',
      entityId: String(n),
      label: existing.name,
    });
  } catch (e) {
    console.error(`[series:${n}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
