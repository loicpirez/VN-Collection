import 'server-only';
import { cachedFetch, TTL } from './vndb-cache';

const VNDB_API = 'https://api.vndb.org/kana';

/**
 * Sensible vote thresholds so a single 10/10 from one user doesn't
 * dominate the top-ranked list. Tuned roughly to match VNDB's own
 * "popularity" cutoff — anything below ~50 votes on VNDB is noise.
 */
export const VNDB_TOP_MIN_VOTES = 50;

export interface VndbTopRanked {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  image: { url: string; thumbnail?: string; sexual?: number } | null;
  rating: number | null;
  votecount: number | null;
  length_minutes: number | null;
  languages: string[];
  platforms: string[];
  developers: { id: string; name: string }[];
}

interface VndbResponse<T> {
  results: T[];
  more: boolean;
}

const VNDB_TOP_FIELDS = [
  'title',
  'alttitle',
  'released',
  'image.url',
  'image.thumbnail',
  'image.sexual',
  'rating',
  'votecount',
  'length_minutes',
  'languages',
  'platforms',
  'developers{id,name}',
].join(', ');

/**
 * Pull the top-rated VNDB VNs filtered by a minimum vote count. Goes
 * through `cachedFetch` so every visit doesn't hammer api.vndb.org;
 * uses the same `TTL.vnSearch` window as our other ranking calls.
 *
 * `limit` is clamped to [10, 200] — larger pulls hit VNDB's
 * per-request cap (100), so we paginate up to 5 pages and aggregate.
 */
export async function fetchVndbTopRanked(
  limit = 100,
  minVotes: number = VNDB_TOP_MIN_VOTES,
): Promise<VndbTopRanked[]> {
  const safe = Math.min(200, Math.max(10, Math.floor(limit)));
  const aggregate = new Map<string, VndbTopRanked>();
  let page = 1;
  while (aggregate.size < safe && page <= 5) {
    const body = {
      filters: ['votecount', '>=', minVotes],
      fields: VNDB_TOP_FIELDS,
      sort: 'rating',
      reverse: true,
      results: Math.min(100, safe),
      page,
    };
    const r = await cachedFetch<VndbResponse<VndbTopRanked>>(
      `${VNDB_API}/vn`,
      {
        __pathTag: `POST /vn:top-ranked:${minVotes}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ttlMs: TTL.vnSearch },
    );
    for (const v of r.data.results) {
      if (!aggregate.has(v.id)) aggregate.set(v.id, v);
      if (aggregate.size >= safe) break;
    }
    if (!r.data.more) break;
    page += 1;
  }
  return Array.from(aggregate.values()).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

export interface VndbTopRankedPage {
  rows: VndbTopRanked[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Page-style cousin of fetchVndbTopRanked for the user-facing
 * pagination on /top-ranked. Returns rows for a single page
 * (1-indexed) plus a `hasMore` hint derived from VNDB's `more`
 * response field — used to enable/disable the "next" control on
 * the UI without an extra round trip.
 *
 * `pageSize` is clamped to [10, 100] (VNDB's per-request cap).
 * VNDB's `page` parameter is 1-indexed and returns rows
 * `(page-1)*pageSize..page*pageSize-1`.
 */
export async function fetchVndbTopRankedPage(
  page = 1,
  pageSize = 50,
  minVotes: number = VNDB_TOP_MIN_VOTES,
): Promise<VndbTopRankedPage> {
  const safeSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const safePage = Math.max(1, Math.floor(page));
  const body = {
    filters: ['votecount', '>=', minVotes],
    fields: VNDB_TOP_FIELDS,
    sort: 'rating',
    reverse: true,
    results: safeSize,
    page: safePage,
  };
  const r = await cachedFetch<VndbResponse<VndbTopRanked>>(
    `${VNDB_API}/vn`,
    {
      __pathTag: `POST /vn:top-ranked:${minVotes}:p${safePage}:${safeSize}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ttlMs: TTL.vnSearch },
  );
  return {
    rows: r.data.results,
    page: safePage,
    pageSize: safeSize,
    hasMore: !!r.data.more,
  };
}
