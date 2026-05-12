import { NextRequest, NextResponse } from 'next/server';
import {
  addToReadingQueue,
  isInCollection,
  listReadingQueue,
  removeFromReadingQueue,
  reorderReadingQueue,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ entries: listReadingQueue() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { vn_id?: unknown };
  if (typeof body.vn_id !== 'string' || !/^(v\d+|egs_\d+)$/i.test(body.vn_id)) {
    return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
  }
  if (!isInCollection(body.vn_id)) {
    return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  }
  return NextResponse.json({ entry: addToReadingQueue(body.vn_id) });
}

export async function DELETE(req: NextRequest) {
  const vnId = req.nextUrl.searchParams.get('vn_id');
  if (!vnId) return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
  removeFromReadingQueue(vnId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  reorderReadingQueue(body.ids as string[]);
  return NextResponse.json({ ok: true });
}
