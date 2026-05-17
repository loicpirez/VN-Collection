import 'server-only';
import { db } from './db';
import { vndbAdvancedSearchRaw } from './vndb-recommend';

export type RecommendMode =
  | 'because-you-liked'
  | 'tag-based'
  | 'hidden-gems'
  | 'highly-rated'
  | 'similar-to-vn';

export const RECOMMEND_MODES: readonly RecommendMode[] = [
  'because-you-liked',
  'tag-based',
  'hidden-gems',
  'highly-rated',
  'similar-to-vn',
];

export const DEFAULT_RECOMMEND_MODE: RecommendMode = 'because-you-liked';

export function parseRecommendMode(raw: string | null | undefined): RecommendMode {
  const v = (raw ?? '').toLowerCase();
  return (RECOMMEND_MODES as readonly string[]).includes(v)
    ? (v as RecommendMode)
    : DEFAULT_RECOMMEND_MODE;
}

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
  /** Tag-overlap score with the picked seed — higher = better fit. */
  score: number;
  matchedTags: { id: string; name: string }[];
  /** True when the VN already exists in the local `collection` table.
   *  Only filled when the result row reaches the UI via `recommendVns`
   *  with `includeOwned` set — otherwise owned VNs are excluded and
   *  the flag is meaningless. Defaults to false. */
  inCollection?: boolean;
  /** True when the VN appears in the cached VNDB wishlist (ulist
   *  label=5). Same caveat as `inCollection`: only meaningful when
   *  `includeWishlist` is set. */
  inWishlist?: boolean;
}

export interface RecommendOptions {
  seedLimit?: number;
  tagLimit?: number;
  resultLimit?: number;
  includeEro?: boolean;
  /**
   * When non-empty, BYPASS the auto-derivation from top-rated VNs and use
   * exactly these tag ids as seeds (uniform weight). Lets the operator pin
   * a custom seed list from the URL (?tags=g123,g456) without losing the
   * "Why these?" panel — it still shows the chosen tags as the seeds.
   */
  customTagIds?: string[];
  /**
   * Selects which recommendation flavour to compute. See the module-level
   * `RecommendMode` for the full list. Defaults to `because-you-liked`.
   */
  mode?: RecommendMode;
  /**
   * For `similar-to-vn` mode: the seed VN id (v123 / egs_123). Its top
   * tags are used as the seed set; the function returns nothing when
   * the id is missing or invalid for this mode.
   */
  seedVnId?: string;
  /**
   * When true, owned VNs are NOT excluded from the result set. Defaults
   * to false — the typical "show me what to play next" use case.
   */
  includeOwned?: boolean;
  /**
   * When true, wishlisted VNs are NOT excluded. Default false. Wishlist
   * data is read from the locally cached VNDB ulist payload; when no
   * cache row exists the helper silently treats the wishlist as empty.
   */
  includeWishlist?: boolean;
}

export interface RecommendResult {
  seeds: RecommendationSeed[];
  results: Recommendation[];
  mode: RecommendMode;
}

/**
 * Build a list of recommended VNs.
 *
 * The shape of the score and the filter set depends on `mode`:
 *   - `because-you-liked` — weighted scoring across the operator's
 *     top-rated VNs (>= 70/100). Owned / wishlist excluded by default.
 *   - `tag-based` — pure tag-overlap. Rating drops out of the score
 *     entirely; ranking is by number of matched seeds + the VNDB tag
 *     rating, so VNs that hit several seeds rise even if they aren't
 *     popular.
 *   - `hidden-gems` — same scoring as `because-you-liked`, then drop
 *     anything with `votecount >= 200`. Low-popularity discovery.
 *   - `highly-rated` — only keep rows with `rating >= 80` AND
 *     `votecount >= 100`. Famous classics that match the seed tags.
 *   - `similar-to-vn` — pulls seeds from a specific VN id passed via
 *     `seedVnId`; uses the same per-seed-tag fan-out as `/similar`.
 */
export async function recommendVns(opts: RecommendOptions = {}): Promise<RecommendResult> {
  const {
    seedLimit = 10,
    tagLimit = 6,
    resultLimit = 24,
    includeEro = false,
    customTagIds,
    mode = DEFAULT_RECOMMEND_MODE,
    seedVnId,
    includeOwned = false,
    includeWishlist = false,
  } = opts;

  // `similar-to-vn` always needs a seed VN; without one the page has
  // nothing to anchor the suggestions to. Treat the missing-seed case
  // as a clean empty result (the page surfaces its own picker copy).
  if (mode === 'similar-to-vn') {
    if (!seedVnId || !/^(v\d+|egs_\d+)$/i.test(seedVnId)) {
      return { seeds: [], results: [], mode };
    }
    const seeds = deriveSeedsFromVn(seedVnId, tagLimit, includeEro, customTagIds);
    if (seeds.length === 0) return { seeds: [], results: [], mode };
    const exclude = collectExclusions(includeOwned, includeWishlist);
    exclude.add(seedVnId);
    const results = await runRecommendForSeeds(seeds, resultLimit, {
      mode,
      exclude,
    });
    return { seeds, results: stampOwnershipFlags(results, includeOwned, includeWishlist), mode };
  }

  // Custom-seeds bypass for the non-similar modes: lets the operator
  // pin a tag set from the URL. Names come from the in-process tag
  // cache; falls back to the raw id if VNDB hasn't been fetched yet.
  if (customTagIds && customTagIds.length > 0) {
    const customSeeds = buildCustomSeeds(customTagIds);
    const exclude = collectExclusions(includeOwned, includeWishlist);
    const results = await runRecommendForSeeds(customSeeds, resultLimit, {
      mode,
      exclude,
    });
    return { seeds: customSeeds, results: stampOwnershipFlags(results, includeOwned, includeWishlist), mode };
  }

  // Auto-derive seeds from the operator's top-rated collection entries.
  const seeds = deriveSeedsFromTopRated(seedLimit, tagLimit, includeEro);
  if (seeds.length === 0) return { seeds: [], results: [], mode };

  const exclude = collectExclusions(includeOwned, includeWishlist);
  const results = await runRecommendForSeeds(seeds, resultLimit, {
    mode,
    exclude,
  });
  return { seeds, results: stampOwnershipFlags(results, includeOwned, includeWishlist), mode };
}

/**
 * Set `inCollection` / `inWishlist` on each result so the card can
 * render the "already in your library / wishlist" badges. We only
 * scan the local DB / cached payload when the matching `include…`
 * flag is on — otherwise the exclusion logic already removed those
 * rows and the badge would never fire.
 *
 * Pure-ish helper (touches the DB and the in-process wishlist cache
 * but does not mutate the input array). Returns a fresh array.
 */
function stampOwnershipFlags(
  results: Recommendation[],
  includeOwned: boolean,
  includeWishlist: boolean,
): Recommendation[] {
  if (!includeOwned && !includeWishlist) return results;
  const ownedSet = includeOwned
    ? new Set(
        (db.prepare(`SELECT vn_id FROM collection`).all() as { vn_id: string }[]).map(
          (r) => r.vn_id,
        ),
      )
    : new Set<string>();
  const wishSet = includeWishlist ? readCachedWishlistIds() : new Set<string>();
  return results.map((r) => ({
    ...r,
    inCollection: ownedSet.has(r.id),
    inWishlist: wishSet.has(r.id),
  }));
}

/**
 * Read the VN ids that should NOT appear in the result set. Always
 * includes owned VNs unless explicitly disabled; wishlist comes from
 * the local VNDB cache row for the ulist label=5 query (silently empty
 * when no row exists, keeping the recommender offline-friendly).
 */
function collectExclusions(includeOwned: boolean, includeWishlist: boolean): Set<string> {
  const exclude = new Set<string>();
  if (!includeOwned) {
    const owned = db.prepare(`SELECT vn_id FROM collection`).all() as { vn_id: string }[];
    for (const row of owned) exclude.add(row.vn_id);
  }
  if (!includeWishlist) {
    for (const id of readCachedWishlistIds()) exclude.add(id);
  }
  return exclude;
}

/**
 * Best-effort wishlist read: scans cached `/ulist` payloads for
 * label-5 (Wishlist) entries. Returns empty if the wishlist hasn't
 * been fetched yet — recommenders should not depend on hitting VNDB
 * just to compute exclusions.
 */
function readCachedWishlistIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const rows = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE '% /ulist|%' LIMIT 50`)
      .all() as Array<{ body: string }>;
    for (const row of rows) {
      let parsed: { results?: Array<{ id?: string; labels?: Array<number | { id?: number }>; label_ids?: number[] }> } | null = null;
      try {
        parsed = JSON.parse(row.body) as { results?: Array<{ id?: string; labels?: Array<number | { id?: number }>; label_ids?: number[] }> };
      } catch {
        continue;
      }
      for (const entry of parsed?.results ?? []) {
        const labels = [
          ...(entry.label_ids ?? []),
          ...(entry.labels ?? []).map((label) => (typeof label === 'number' ? label : label.id)).filter((id): id is number => typeof id === 'number'),
        ];
        if (entry.id && /^v\d+$/.test(entry.id) && labels.includes(5)) ids.add(entry.id);
      }
    }
  } catch {
    // Defensive: an unexpected schema shape should never crash the
    // recommender. Silently treat as "no wishlist data available".
  }
  return ids;
}

function buildCustomSeeds(customTagIds: string[]): RecommendationSeed[] {
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE '% /tag|%' LIMIT 20`)
    .all() as Array<{ body: string }>;
  const nameLookup = new Map<string, string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.body) as { results?: Array<{ id: string; name: string }> };
      for (const tag of parsed.results ?? []) {
        if (!nameLookup.has(tag.id) && tag.name) nameLookup.set(tag.id, tag.name);
      }
    } catch {
      // ignore malformed cache entries
    }
  }
  return customTagIds.map((id) => ({
    tagId: id,
    name: nameLookup.get(id) ?? id,
    weight: 1,
  }));
}

function deriveSeedsFromTopRated(seedLimit: number, tagLimit: number, includeEro: boolean): RecommendationSeed[] {
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
    // Per-VN: keep the top-3 by VNDB tag rating; drop ero tags by default.
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
  return Array.from(tagWeights.entries())
    .map(([tagId, { name, weight }]) => ({ tagId, name, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, tagLimit);
}

/**
 * Pull the top-N tags from a specific VN's local tag list. Used by
 * `similar-to-vn` mode (the same shape `/similar` already employs).
 * Honours the `includeEro` switch and falls back gracefully when the
 * VN row is missing or its tag column is empty.
 */
function deriveSeedsFromVn(
  vnId: string,
  tagLimit: number,
  includeEro: boolean,
  customTagIds: string[] | undefined,
): RecommendationSeed[] {
  const row = db
    .prepare(`SELECT tags AS tags_json FROM vn WHERE id = ?`)
    .get(vnId) as { tags_json: string | null } | undefined;
  let tags: Array<{
    id: string;
    name: string;
    rating?: number;
    spoiler?: number;
    category?: string | null;
  }> = [];
  try {
    tags = row?.tags_json ? JSON.parse(row.tags_json) : [];
  } catch {
    tags = [];
  }
  if (customTagIds && customTagIds.length > 0) {
    const byId = new Map(tags.map((t) => [t.id, t] as const));
    return customTagIds.map((id) => {
      const found = byId.get(id);
      return {
        tagId: id,
        name: found?.name ?? id,
        weight: found?.rating ?? 1,
      };
    });
  }
  return tags
    .filter((t) => (t.spoiler ?? 0) === 0 && (includeEro || t.category !== 'ero'))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, tagLimit)
    .map((t) => ({ tagId: t.id, name: t.name, weight: t.rating ?? 1 }));
}

/**
 * Given a seed-tag set + a mode, fan out to VNDB once per seed (parallel,
 * throttled), aggregate hits and apply the mode-specific filter / sort
 * pass. A single seed failure logs and skips that seed only; the page
 * still renders the partial result.
 */
async function runRecommendForSeeds(
  seeds: RecommendationSeed[],
  resultLimit: number,
  { mode, exclude }: { mode: RecommendMode; exclude: Set<string> },
): Promise<Recommendation[]> {
  if (seeds.length === 0) return [];

  // `highly-rated` lifts the VNDB-side filter to `votecount >= 100`
  // so the upstream query already restricts to popular titles. Other
  // modes still apply the loose `votecount >= 50` floor.
  const minVotesUpstream = mode === 'highly-rated' ? 100 : 50;

  const aggregate = new Map<string, Recommendation>();
  const settled = await Promise.all(
    seeds.map((seed) =>
      vndbAdvancedSearchRaw({
        filters: ['and', ['tag', '=', [seed.tagId, 1, 1.5]], ['votecount', '>=', minVotesUpstream]],
        sort: 'rating',
        reverse: true,
        results: 30,
      })
        .then((hits) => ({ seed, hits }))
        .catch((err) => {
          // A single seed failure must not disqualify the whole page.
          console.error(`[recommend] seed ${seed.tagId} failed:`, (err as Error).message);
          return { seed, hits: [] as Awaited<ReturnType<typeof vndbAdvancedSearchRaw>> };
        }),
    ),
  );

  for (const { seed, hits } of settled) {
    for (const h of hits) {
      if (exclude.has(h.id)) continue;
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
      // `tag-based` drops the seed weight from the score so the
      // ranking depends only on tag-overlap count + the VNDB tag
      // rating contribution; `because-you-liked` and the seeded
      // similar mode keep the weighted sum.
      if (mode === 'tag-based') {
        entry.score += 1;
      } else {
        entry.score += seed.weight;
      }
      if (!entry.matchedTags.some((m) => m.id === seed.tagId)) {
        entry.matchedTags.push({ id: seed.tagId, name: seed.name });
      }
    }
  }

  let results = Array.from(aggregate.values());

  // Mode-specific post-fetch filters.
  if (mode === 'hidden-gems') {
    results = results.filter((r) => (r.votecount ?? 0) < 200);
  } else if (mode === 'highly-rated') {
    results = results.filter((r) => (r.rating ?? 0) >= 80 && (r.votecount ?? 0) >= 100);
  }

  return results
    .sort((a, b) => b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, resultLimit);
}
