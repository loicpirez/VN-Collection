import { NextRequest, NextResponse } from 'next/server';
import { resetCollectionCustomOrder, setCollectionCustomOrder } from '@/lib/db';

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
    ? body.ids.filter((id): id is string => typeof id === 'string' && /^(v\d+|egs:\d+)$/i.test(id))
    : null;
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array of VN ids' }, { status: 400 });
  }
  try {
    setCollectionCustomOrder(ids);
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    resetCollectionCustomOrder();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
