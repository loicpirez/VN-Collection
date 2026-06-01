import { NextRequest, NextResponse } from 'next/server';
import {
  deleteShelf,
  getShelf,
  listShelfDisplaySlots,
  listShelfSlots,
  renameShelf,
  resizeShelf,
  SHELF_MAX,
  SHELF_MIN,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

import { readJsonObject } from '@/lib/api-body';
import { validateSafeInt, validateText } from '@/lib/input-validators';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    shelf,
    slots: listShelfSlots(sid),
    displays: listShelfDisplaySlots(sid),
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    cols?: unknown;
    rows?: unknown;
  };
  const colsResult = body.cols === undefined ? null : validateSafeInt(body.cols, { field: 'cols', min: SHELF_MIN, max: SHELF_MAX });
  if (colsResult && !colsResult.ok) return NextResponse.json({ error: colsResult.error }, { status: 400 });
  const rowsResult = body.rows === undefined ? null : validateSafeInt(body.rows, { field: 'rows', min: SHELF_MIN, max: SHELF_MAX });
  if (rowsResult && !rowsResult.ok) return NextResponse.json({ error: rowsResult.error }, { status: 400 });
  const nameResult = 'name' in body ? validateText(body.name, { field: 'name', max: 100 }) : null;
  if (nameResult && !nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  const current = getShelf(sid);
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    if (nameResult?.ok) {
      const shelf = renameShelf(sid, nameResult.value);
      if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
      recordActivity({ kind: 'shelf.rename', entity: 'shelf', entityId: String(sid), label: 'Renamed shelf', payload: { name: shelf.name } });
    }
    if (colsResult || rowsResult) {
      const result = resizeShelf(
        sid,
        colsResult?.ok ? colsResult.value : current.cols,
        rowsResult?.ok ? rowsResult.value : current.rows,
      );
      if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
      recordActivity({ kind: 'shelf.resize', entity: 'shelf', entityId: String(sid), label: 'Resized shelf', payload: { cols: result.shelf.cols, rows: result.shelf.rows, evicted: result.evicted.length } });
      return NextResponse.json({
        shelf: result.shelf,
        slots: listShelfSlots(sid),
        evicted: result.evicted,
      });
    }
    return NextResponse.json({ shelf: getShelf(sid), slots: listShelfSlots(sid) });
  } catch (e) {
    console.error('shelf patch failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf patch failed' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const ok = deleteShelf(sid);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  recordActivity({ kind: 'shelf.delete', entity: 'shelf', entityId: String(sid), label: 'Deleted shelf' });
  return NextResponse.json({ ok: true });
}
