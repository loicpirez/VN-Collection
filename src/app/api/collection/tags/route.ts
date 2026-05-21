import { NextRequest, NextResponse } from 'next/server';
import { listCollectionTags } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const aggregates = listCollectionTags();
  // Mirror the shape returned by /api/tags so the same UI renders both.
  const tags = aggregates.map((a) => ({
    id: a.id,
    name: a.name,
    aliases: [] as string[],
    description: null,
    category: a.category ?? 'cont',
    searchable: true,
    applicable: true,
    vn_count: a.count,
  }));
  return NextResponse.json({ tags });
}
