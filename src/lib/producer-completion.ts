import 'server-only';
import { db } from './db';
import { cachedFetch, TTL } from './vndb-cache';

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
  const r = await cachedFetch<{ results: Array<Omit<ProducerCompletionRow, 'owned' | 'vnId'> & { id: string }> }>(
    `${VNDB_API}/vn`,
    {
      __pathTag: 'POST /vn:producer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ttlMs: TTL.vnSearch },
  );
  const all = r.data.results;
  if (all.length === 0) {
    return { totalKnown: 0, ownedCount: 0, pct: 0, vns: [] };
  }
  const owned = new Set(
    (db
      .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${all.map(() => '?').join(',')})`)
      .all(...all.map((v) => v.id)) as { vn_id: string }[]).map((r) => r.vn_id),
  );
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
