import { NextResponse } from 'next/server';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';
import { isInCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ needsAuth: true, items: [] });
    }
    const items = result.map((e) => ({
      ...e,
      in_collection: isInCollection(e.vn.id),
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
