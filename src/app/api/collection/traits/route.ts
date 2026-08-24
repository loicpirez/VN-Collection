import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { readCachedCharactersForVns } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Aggregate {
  id: string;
  name: string;
  group_name: string | null;
  sexual: boolean;
  count: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  let vnIds: string[];
  try {
    vnIds = await getCollectionCoreRepository().listIds();
  } catch (error) {
    return internalError('collection.traits.GET', error);
  }
  const cachedCharacters = await readCachedCharactersForVns(vnIds);
  const map = new Map<string, Aggregate>();
  let withCache = 0;
  for (const vnId of vnIds) {
    const chars = cachedCharacters.get(vnId) ?? [];
    if (chars.length === 0) continue;
    withCache++;
    const seenInVn = new Set<string>();
    for (const c of chars) {
      for (const tr of c.traits) {
        if (tr.spoiler !== 0) continue;
        if (seenInVn.has(tr.id)) continue;
        seenInVn.add(tr.id);
        const prev = map.get(tr.id);
        if (prev) {
          prev.count++;
        } else {
          map.set(tr.id, {
            id: tr.id,
            name: tr.name ?? tr.id,
            group_name: tr.group_name ?? null,
            sexual: !!tr.sexual,
            count: 1,
          });
        }
      }
    }
  }
  const aggregates = Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  // Mirror the shape returned by /api/traits so TraitsBrowser renders both sources.
  const traits = aggregates.map((a) => ({
    id: a.id,
    name: a.name,
    aliases: [] as string[],
    description: null,
    searchable: true,
    applicable: true,
    sexual: a.sexual,
    group_id: null,
    group_name: a.group_name,
    char_count: a.count,
  }));
  return NextResponse.json({
    traits,
    cache_coverage: { total_vns: vnIds.length, with_cached_characters: withCache },
  });
}
