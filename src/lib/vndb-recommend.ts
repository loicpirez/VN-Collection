import 'server-only';
import { cachedFetch, TTL } from './vndb-cache';

const VNDB_API = 'https://api.vndb.org/kana';
const REC_FIELDS = [
  'title',
  'alttitle',
  'released',
  'rating',
  'votecount',
  'length_minutes',
  'image.url',
  'image.thumbnail',
  'image.sexual',
  'developers{id,name}',
].join(', ');

interface RecHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  votecount: number | null;
  length_minutes: number | null;
  image: { url: string; thumbnail: string; sexual?: number } | null;
  developers: { id: string; name: string }[];
}

interface QueryArgs {
  filters: unknown;
  sort?: string;
  reverse?: boolean;
  results?: number;
}

/**
 * Thin wrapper around POST /vn for the recommendation engine — kept out of
 * vndb.ts so it can carry its own field list (no relations / staff / va) and
 * own its own TTL bucket without touching the main search path.
 */
export async function vndbAdvancedSearchRaw(args: QueryArgs): Promise<RecHit[]> {
  const body = {
    filters: args.filters,
    fields: REC_FIELDS,
    sort: args.sort ?? 'rating',
    reverse: args.reverse ?? true,
    results: Math.min(args.results ?? 30, 100),
  };
  const r = await cachedFetch<{ results: RecHit[] }>(
    `${VNDB_API}/vn`,
    {
      __pathTag: 'POST /vn:rec',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ttlMs: TTL.vnSearch },
  );
  return r.data.results;
}
