import { NextRequest, NextResponse } from 'next/server';
import { resetCollectionCustomOrder, setCollectionCustomOrder } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Drag-to-reorder endpoint. PATCH with `{ ids: ["v1", "v2", …] }` writes
 * `custom_order` so the supplied ids show up in that order under the
 * "Custom" sort. DELETE clears every row's custom_order at once.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string' && /^(v\d+|egs_\d+)$/i.test(id))
    : null;
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array of VN ids' }, { status: 400 });
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
