import { NextRequest, NextResponse } from 'next/server';
import { deleteSeries, getSeries, updateSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
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
    if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
    }
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = trimmed;
  }
  if ('description' in body) {
    if (body.description == null) {
      patch.description = null;
    } else if (typeof body.description === 'string') {
      if (body.description.length > 5000) {
        return NextResponse.json({ error: 'description too long (max 5000)' }, { status: 400 });
      }
      patch.description = body.description;
    } else {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
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
