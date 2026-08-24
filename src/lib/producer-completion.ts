import 'server-only';
import { cachedFetch, TTL } from './vndb-cache';
import { decodeProducerCompletionResults } from './vndb-feed-cache-shape';
import { getCollectionCoreRepository } from './db/repositories/collection-core';

const VNDB_API = 'https://api.vndb.org/kana';

export interface ProducerCompletionRow {
  vnId: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  image: { url: string; thumbnail: string; sexual?: number } | null;
  owned: boolean;
}

export interface ProducerCompletion {
  totalKnown: number;
  ownedCount: number;
  pct: number;
  vns: ProducerCompletionRow[];
}

/** VNDB row used to build one producer-completion entry before local ownership enrichment. */
export type ProducerCompletionSourceRow = Omit<ProducerCompletionRow, 'owned' | 'vnId'> & { id: string };

/**
 * For a given producer id, query VNDB for every VN they developed and
 * cross-reference against the local `collection` table.
 *
 * Uses the `developer` filter on POST /vn so we get the canonical "this
 * producer is in the developer list" set, which is what users care about
 * (a publisher port we don't own is less interesting).
 */
export async function fetchProducerCompletion(producerId: string): Promise<ProducerCompletion> {
  const body = {
    filters: ['developer', '=', ['id', '=', producerId]],
    fields: 'title, alttitle, released, rating, image.url, image.thumbnail, image.sexual',
    sort: 'released',
    reverse: true,
    results: 100,
  };
  const r = await cachedFetch<{ results: ProducerCompletionSourceRow[] }>(
    `${VNDB_API}/vn`,
    {
      __pathTag: 'POST /vn:producer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ttlMs: TTL.vnSearch, decode: decodeProducerCompletionResults },
  );
  const all = r.data.results;
  if (all.length === 0) {
    return { totalKnown: 0, ownedCount: 0, pct: 0, vns: [] };
  }
  const ids = all.map((v) => v.id);
  const owned = await getCollectionCoreRepository().containsMany(ids);
  const ownedCount = all.filter((v) => owned.has(v.id)).length;
  return {
    totalKnown: all.length,
    ownedCount,
    pct: Math.round((ownedCount / all.length) * 100),
    vns: all.map((v) => ({
      vnId: v.id,
      title: v.title,
      alttitle: v.alttitle ?? null,
      released: v.released ?? null,
      rating: v.rating ?? null,
      image: v.image ?? null,
      owned: owned.has(v.id),
    })),
  };
}
