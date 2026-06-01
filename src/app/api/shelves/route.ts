import { NextRequest, NextResponse } from 'next/server';
import {
  createShelf,
  listShelves,
  listUnplacedOwnedReleases,
  reorderShelves,
  SHELF_MAX,
  SHELF_MIN,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateSafeInt, validateText } from '@/lib/input-validators';

import { readJsonObject } from '@/lib/api-body';
export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const includePool = req.nextUrl.searchParams.get('pool') === '1';
  return NextResponse.json({
    shelves: listShelves(),
    unplaced: includePool ? listUnplacedOwnedReleases() : undefined,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    cols?: unknown;
    rows?: unknown;
  };
  const nameResult = validateText(body.name, { field: 'name', max: 100 });
  if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  const colsResult = body.cols === undefined ? null : validateSafeInt(body.cols, { field: 'cols', min: SHELF_MIN, max: SHELF_MAX });
  if (colsResult && !colsResult.ok) return NextResponse.json({ error: colsResult.error }, { status: 400 });
  const rowsResult = body.rows === undefined ? null : validateSafeInt(body.rows, { field: 'rows', min: SHELF_MIN, max: SHELF_MAX });
  if (rowsResult && !rowsResult.ok) return NextResponse.json({ error: rowsResult.error }, { status: 400 });
  try {
    const shelf = createShelf({
      name: nameResult.value,
      cols: colsResult?.ok ? colsResult.value : undefined,
      rows: rowsResult?.ok ? rowsResult.value : undefined,
    });
    recordActivity({ kind: 'shelf.create', entity: 'shelf', entityId: String(shelf.id), label: 'Created shelf', payload: { name: shelf.name, cols: shelf.cols, rows: shelf.rows } });
    return NextResponse.json({ shelf });
  } catch (e) {
    // Avoid surfacing raw error message (could carry file paths /
    // SQL fragments from db.ts validators). Log server-side, send
    // a fixed string to the client.
    console.error('shelf create failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf create failed' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { order?: unknown };
  if (
    !Array.isArray(body.order) ||
    body.order.length > 500 ||
    body.order.some((v) => !Number.isSafeInteger(v) || (v as number) <= 0)
  ) {
    return NextResponse.json({ error: 'order must be array of positive integers (max 500)' }, { status: 400 });
  }
  const order = body.order as number[];
  if (new Set(order).size !== order.length) {
    return NextResponse.json({ error: 'order must not contain duplicates' }, { status: 400 });
  }
  reorderShelves(order);
  recordActivity({ kind: 'shelf.reorder', entity: 'shelf', label: 'Reordered shelves', payload: { order: body.order } });
  return NextResponse.json({ shelves: listShelves() });
}
