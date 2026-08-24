import 'server-only';
import { cachedFetch, readCachedJsonEntry, TTL } from './vndb-cache';
import { decodeRecommendationResults } from './vndb-feed-cache-shape';

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

/** VNDB VN summary returned by recommendation-only searches. */
export interface RecHit {
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

/** Cache-only recommendation search result and its current freshness. */
export interface RecSearchSnapshot {
  hits: RecHit[];
  fresh: boolean;
}

function buildRecommendationBody(args: QueryArgs) {
  return {
    filters: args.filters,
    fields: REC_FIELDS,
    sort: args.sort ?? 'rating',
    reverse: args.reverse ?? true,
    results: Math.min(args.results ?? 30, 100),
  };
}

/**
 * Thin wrapper around POST /vn for the recommendation engine — kept out of
 * vndb.ts so it can carry its own field list (no relations / staff / va) and
 * own its own TTL bucket without touching the main search path.
 */
export async function vndbAdvancedSearchRaw(args: QueryArgs): Promise<RecHit[]> {
  const body = buildRecommendationBody(args);
  const r = await cachedFetch<{ results: RecHit[] }>(
    `${VNDB_API}/vn`,
    {
      __pathTag: 'POST /vn:rec',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ttlMs: TTL.vnSearch, decode: decodeRecommendationResults },
  );
  return r.data.results;
}

/**
 * Read one recommendation query from the local cache without contacting VNDB.
 *
 * @param args Recommendation query whose body must match the network request.
 * @returns Cached hits and whether the snapshot is still inside its TTL.
 */
export async function vndbAdvancedSearchCachedRaw(args: QueryArgs): Promise<RecSearchSnapshot> {
  const entry = await readCachedJsonEntry(
    'POST',
    'POST /vn:rec',
    buildRecommendationBody(args),
    decodeRecommendationResults,
  );
  return {
    hits: entry?.data.results ?? [],
    fresh: entry !== null && Date.now() < entry.expiresAt,
  };
}
