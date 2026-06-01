import { NextRequest, NextResponse } from 'next/server';
import { resetCollectionCustomOrder, setCollectionCustomOrder } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Drag-to-reorder endpoint. PATCH with `{ ids: ["v1", "v2", …] }` writes
 * `custom_order` so the supplied ids show up in that order under the
 * "Custom" sort. DELETE clears every row's custom_order at once.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length > 50000) {
    return NextResponse.json({ error: 'ids must be an array of at most 50000 VN ids' }, { status: 400 });
  }
  if (body.ids.some((id) => typeof id !== 'string' || !isValidVnId(id))) {
    return NextResponse.json({ error: 'ids must contain only VN ids' }, { status: 400 });
  }
  const ids = (body.ids as string[]).map(normalizeVnId);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array of VN ids' }, { status: 400 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 });
  }
  try {
    setCollectionCustomOrder(ids);
    try {
      recordActivity({
        kind: 'collection.custom-order',
        entity: 'collection',
        entityId: null,
        label: 'Saved custom order',
        payload: { count: ids.length },
      });
    } catch (e) {
      console.error('[collection/order] activity log failed:', (e as Error).message);
    }
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error('[collection/order] setCollectionCustomOrder failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not save order' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    resetCollectionCustomOrder();
    try {
      recordActivity({
        kind: 'collection.custom-order',
        entity: 'collection',
        entityId: null,
        label: 'Cleared custom order',
        payload: { action: 'reset' },
      });
    } catch (e) {
      console.error('[collection/order] activity log failed:', (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[collection/order] resetCollectionCustomOrder failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not reset order' }, { status: 500 });
  }
}
