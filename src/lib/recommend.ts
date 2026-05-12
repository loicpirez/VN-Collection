import 'server-only';
import { db } from './db';
import { vndbAdvancedSearchRaw } from './vndb-recommend';

export interface RecommendationSeed {
  tagId: string;
  name: string;
  weight: number;
}

export interface Recommendation {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  votecount: number | null;
  length_minutes: number | null;
  image: { url: string; thumbnail: string; sexual: number | null } | null;
  developers: { name: string }[];
  /** Tag-overlap score with the user's seed — higher = better fit. */
  score: number;
  matchedTags: { id: string; name: string }[];
}

/**
 * Build a list of recommended VNs based on the user's highest-rated entries.
 *
 * Strategy:
 *   1. Pick the top-10 user-rated, completed VNs (>= 70 / 100) with at
 *      least one tag we can use.
 *   2. Extract their top tags weighted by user_rating, dedup, keep the
 *      top 6 by accumulated weight.
 *   3. Query VNDB for each of those tags with `votecount > 50` so the
 *      results are vetted, exclude tags with category='ero' (most users
 *      don't want raw nukige recs).
 *   4. Aggregate hits, score by sum of matched seed weights, filter out
 *      anything already in the collection or wishlist.
 */
export interface RecommendOptions {
  seedLimit?: number;
  tagLimit?: number;
  resultLimit?: number;
  includeEro?: boolean;
}

export async function recommendVns(opts: RecommendOptions = {}): Promise<{ seeds: RecommendationSeed[]; results: Recommendation[] }> {
  const { seedLimit = 10, tagLimit = 6, resultLimit = 24, includeEro = false } = opts;

  // Compute weighted seed tags from the user's top-rated collection entries.
  const rows = db
    .prepare(`
      SELECT v.id, c.user_rating, v.tags AS tags_json
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.user_rating IS NOT NULL AND c.user_rating >= 70
      ORDER BY c.user_rating DESC, c.updated_at DESC
      LIMIT ?
    `)
    .all(seedLimit) as Array<{ id: string; user_rating: number; tags_json: string | null }>;

  const tagWeights = new Map<string, { name: string; weight: number }>();
  for (const r of rows) {
    let tags: Array<{ id: string; name: string; rating: number; category?: string | null }> = [];
    try { tags = r.tags_json ? JSON.parse(r.tags_json) : []; } catch { tags = []; }
    // Per-VN: keep top-3 by VNDB tag rating, drop ero tags by default.
    const ranked = tags
      .filter((t) => includeEro || t.category !== 'ero')
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 3);
    for (const t of ranked) {
      const cur = tagWeights.get(t.id);
      const add = r.user_rating / 100;
      if (cur) {
        cur.weight += add;
      } else {
        tagWeights.set(t.id, { name: t.name, weight: add });
      }
    }
  }
  const seeds: RecommendationSeed[] = Array.from(tagWeights.entries())
    .map(([tagId, { name, weight }]) => ({ tagId, name, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, tagLimit);
  if (seeds.length === 0) return { seeds: [], results: [] };

  // Exclude VNs already in collection or wishlist (the existing wishlist
  // helper would re-resolve VNDB; we keep this offline and join client-side).
  const owned = new Set(
    (db.prepare(`SELECT vn_id FROM collection`).all() as { vn_id: string }[]).map((r) => r.vn_id),
  );

  // One filter per seed tag with votecount minimum + Bayesian rating sort.
  // VNDB's "tag" filter matches parent tags too, which gives us cluster recs
  // automatically without re-implementing the DAG client-side.
  const aggregate = new Map<string, Recommendation>();
  for (const seed of seeds) {
    const hits = await vndbAdvancedSearchRaw({
      filters: ['and',
        ['tag', '=', [seed.tagId, 1, 1.5]],
        ['votecount', '>=', 50],
      ],
      sort: 'rating',
      reverse: true,
      results: 30,
    });
    for (const h of hits) {
      if (owned.has(h.id)) continue;
      let entry = aggregate.get(h.id);
      if (!entry) {
        entry = {
          id: h.id,
          title: h.title,
          alttitle: h.alttitle ?? null,
          released: h.released ?? null,
          rating: h.rating ?? null,
          votecount: h.votecount ?? null,
          length_minutes: h.length_minutes ?? null,
          image: h.image
            ? { url: h.image.url, thumbnail: h.image.thumbnail, sexual: h.image.sexual ?? null }
            : null,
          developers: (h.developers ?? []).map((d) => ({ name: d.name })),
          score: 0,
          matchedTags: [],
        };
        aggregate.set(h.id, entry);
      }
      entry.score += seed.weight;
      entry.matchedTags.push({ id: seed.tagId, name: seed.name });
    }
  }

  const results = Array.from(aggregate.values())
    .sort((a, b) => b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, resultLimit);
  return { seeds, results };
}
