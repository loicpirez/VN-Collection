import { NextRequest, NextResponse } from 'next/server';
import {
  createShelf,
  listShelves,
  listUnplacedOwnedReleases,
  reorderShelves,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// intentionally public — single-user self-hosted app; shelf layout
// carries no PII. Mutating handlers below remain gated.
export async function GET(req: NextRequest) {
  const includePool = req.nextUrl.searchParams.get('pool') === '1';
  return NextResponse.json({
    shelves: listShelves(),
    unplaced: includePool ? listUnplacedOwnedReleases() : undefined,
  });
}

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    cols?: unknown;
    rows?: unknown;
  };
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const shelf = createShelf({
      name: body.name,
      cols: typeof body.cols === 'number' ? body.cols : undefined,
      rows: typeof body.rows === 'number' ? body.rows : undefined,
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

export async function PATCH(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { order?: unknown };
  if (!Array.isArray(body.order) || body.order.some((v) => typeof v !== 'number')) {
    return NextResponse.json({ error: 'order must be number[]' }, { status: 400 });
  }
  reorderShelves(body.order as number[]);
  recordActivity({ kind: 'shelf.reorder', entity: 'shelf', label: 'Reordered shelves', payload: { order: body.order } });
  return NextResponse.json({ shelves: listShelves() });
}
