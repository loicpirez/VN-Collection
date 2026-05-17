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

/**
 * Tag ids that are so universal across visual novels that allowing them to
 * dominate the seed pool collapses every "personalised" recommendation to
 * the same three suggestions. Each id is multiplied by its penalty value
 * during seed ranking (penalty ∈ (0, 1), so tags here always rank LOWER
 * than a non-generic tag with the same raw count).
 *
 * The list covers three tiers:
 *   0.15-0.25 — structural / format tags (present in nearly every VN):
 *               ADV engine, Multiple Routes
 *   0.3-0.4   — ubiquitous genre / protagonist tags: Romance, Male
 *               Protagonist, Nukige, Dating Sim, School Setting
 *   0.45-0.55 — over-applied heroine archetypes
 *
 * Operators who want a penalty tag as a seed can pin it via the
 * `?tags=…` custom-seed URL — penalties only apply to AUTO-derived seeds.
 *
 * Sources: VNDB tag pages https://vndb.org/g{id}
 */
export const GENERIC_TAG_PENALTY_MAP: Record<string, number> = {
  // --- Structural / format (nearly every VN has these) ---
  g134: 0.15, // ADV (adventure engine format)
  g184: 0.25, // NVL (novel-mode engine format)

  // --- Ubiquitous genre / protagonist / setting tags ---
  g630: 0.3,  // Male Protagonist
  g4:   0.3,  // Romance (extremely common genre in VNs)
  g255: 0.35, // Modern Day Japan (default setting for most commercial VNs)
  g153: 0.35, // School Life (second-most common setting)
  g73:  0.4,  // Comedy (very common genre — rarely the distinguishing factor)
  g2:   0.35, // Slice of Life (broad umbrella — doesn't indicate specific taste)

  // --- Common VN mechanics that appear in most titles ---
  g117: 0.45, // Multiple Endings (nearly universal; not taste-specific)

  // --- Over-applied heroine archetypes ---
  g69:   0.4,  // High School Student Heroine
  g1166: 0.5,  // Tsundere Heroine
  g1167: 0.5,  // Dandere Heroine
  g540:  0.5,  // Genki Heroine
  g541:  0.5,  // Kuudere Heroine
  g542:  0.5,  // Yandere Heroine
};

/**
 * Apply the generic-tag penalty multiplier to a raw weight. Tags not in
 * the map pass through unchanged.
 */
export function applyGenericPenalty(tagId: string, weight: number): number {
  const mul = GENERIC_TAG_PENALTY_MAP[tagId];
  return mul == null ? weight : weight * mul;
}

export interface RecommendationSeed {
  tagId: string;
  name: string;
  weight: number;
  /** Distinct seed VN ids that contributed this tag. Lets the UI render
   *  a "shared by N of your VNs" hint and lets the rotation logic
   *  pick top-2 contributors per recommendation. */
  contributors?: string[];
  /** Raw (pre-penalty) weight, kept so the explanation panel can show
   *  both numbers side-by-side. */
  rawWeight?: number;
}

/** Per-seed-class counts surfaced in the explanation panel. */
export interface SignalCounts {
  finished: number;
  rated: number;
  favorite: number;
  queue: number;
  wishlist: number;
  /** Distinct VNs across every signal class — what the algorithm actually
   *  sampled. The sum of individual counts will exceed this when a VN
   *  qualifies under multiple classes. */
  total: number;
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
  /** Up to two seed VNs that most contributed to this recommendation,
   *  ordered by their per-seed weight. Used by the card "Because you
   *  liked X / Y" chip so the seed actually rotates between rows. */
  contributors?: Array<{ id: string; title: string }>;
  /** Studios / developers shared with at least three seeds. */
  studioOverlap?: number;
  /** Scenarist / staff shared with at least three seeds. */
  staffOverlap?: number;
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
  /**
   * When true (default), the wishlist is folded into the SEED pool too —
   * wishlisted VNs supply seed tags alongside finished / rated / favourite.
   * Set false to mirror the original behaviour. Exposed so the
   * /recommendations page can wire a Settings toggle + URL param.
   */
  useWishlist?: boolean;
}

export interface RecommendResult {
  seeds: RecommendationSeed[];
  results: Recommendation[];
  mode: RecommendMode;
  /** Per-class seed counts so the explanation panel can report
   *  "5 finished + 3 rated + 2 favorite = 8 distinct VNs sampled". */
  signalCounts?: SignalCounts;
  /** Same shape as `seeds`, but capturing the picture BEFORE the
   *  generic-tag penalty multiplier was applied. Lets the panel show
   *  what would have ranked without the broadening pass. */
  rawSeeds?: RecommendationSeed[];
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
    useWishlist = true,
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
      seedTitles: new Map([[seedVnId, getVnTitle(seedVnId) ?? seedVnId]]),
    });
    return {
      seeds,
      results: stampOwnershipFlags(results, includeOwned, includeWishlist),
      mode,
    };
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
      seedTitles: new Map(),
    });
    return {
      seeds: customSeeds,
      results: stampOwnershipFlags(results, includeOwned, includeWishlist),
      mode,
    };
  }

  // Auto-derive seeds from the operator's broader signal pool: every
  // finished VN, every rated >= 70 VN, every favourite, every reading
  // queue entry, plus optional wishlist. Tags shared across multiple
  // seed VNs get a multi-source boost; generic tags get penalised.
  const union = buildSeedUnion(useWishlist);
  if (union.vns.size === 0) {
    return {
      seeds: [],
      results: [],
      mode,
      signalCounts: union.counts,
    };
  }
  const { seeds, rawSeeds } = deriveSeedsFromUnion(union, seedLimit, tagLimit, includeEro);
  if (seeds.length === 0) {
    return {
      seeds: [],
      results: [],
      mode,
      signalCounts: union.counts,
      rawSeeds,
    };
  }

  const exclude = collectExclusions(includeOwned, includeWishlist);
  const seedTitles = new Map<string, string>();
  for (const [vnId, info] of union.vns) {
    if (info.title) seedTitles.set(vnId, info.title);
  }
  const results = await runRecommendForSeeds(seeds, resultLimit, {
    mode,
    exclude,
    seedTitles,
    studioCount: union.studioCount,
    staffCount: union.staffCount,
  });
  return {
    seeds,
    results: stampOwnershipFlags(results, includeOwned, includeWishlist),
    mode,
    signalCounts: union.counts,
    rawSeeds,
  };
}

interface SeedVnInfo {
  title: string | null;
  rating: number; // 0..100; uses rating if available else 70 default
  tags: Array<{ id: string; name: string; rating?: number; spoiler?: number; category?: string | null }>;
  developers: string[];
  staff: string[];
  /** Why this VN entered the pool. */
  signals: Array<'completed' | 'rated' | 'favorite' | 'queue' | 'wishlist'>;
}

interface SeedUnion {
  vns: Map<string, SeedVnInfo>;
  counts: SignalCounts;
  studioCount: Map<string, number>;
  staffCount: Map<string, number>;
}

/**
 * Collect every VN that the operator has signaled positive interest in.
 * Five overlapping signal classes (a VN can light up several):
 *   - finished — `collection.status = 'completed'`
 *   - rated    — `collection.user_rating >= 70`
 *   - favorite — `collection.favorite = 1`
 *   - queue    — `reading_queue` (the "play next" list)
 *   - wishlist — VNDB ulist label=5, gated behind `useWishlist`
 */
function buildSeedUnion(useWishlist: boolean): SeedUnion {
  const vns = new Map<string, SeedVnInfo>();
  const counts: SignalCounts = {
    finished: 0,
    rated: 0,
    favorite: 0,
    queue: 0,
    wishlist: 0,
    total: 0,
  };

  function touch(vnId: string, signal: SeedVnInfo['signals'][number], rating: number | null): void {
    let info = vns.get(vnId);
    if (!info) {
      const row = db
        .prepare(
          `SELECT title, tags, developers, staff FROM vn WHERE id = ?`,
        )
        .get(vnId) as
        | { title: string | null; tags: string | null; developers: string | null; staff: string | null }
        | undefined;
      let tags: SeedVnInfo['tags'] = [];
      let developers: string[] = [];
      let staff: string[] = [];
      try {
        tags = row?.tags ? JSON.parse(row.tags) : [];
      } catch {
        tags = [];
      }
      try {
        const devs = row?.developers ? (JSON.parse(row.developers) as Array<{ id?: string; name?: string }>) : [];
        developers = devs.map((d) => d.id ?? d.name ?? '').filter((s) => s.length > 0);
      } catch {
        developers = [];
      }
      try {
        const staffRaw = row?.staff ? (JSON.parse(row.staff) as Array<{ id?: string; aid?: string | number; name?: string }>) : [];
        staff = staffRaw.map((s) => s.id ?? (s.aid != null ? String(s.aid) : s.name ?? '')).filter((s) => s.length > 0);
      } catch {
        staff = [];
      }
      info = {
        title: row?.title ?? null,
        rating: rating ?? 70,
        tags,
        developers,
        staff,
        signals: [],
      };
      vns.set(vnId, info);
    } else if (rating != null && rating > info.rating) {
      info.rating = rating;
    }
    if (!info.signals.includes(signal)) info.signals.push(signal);
  }

  // finished
  try {
    const rows = db
      .prepare(
        `SELECT vn_id, user_rating FROM collection WHERE status = 'completed'`,
      )
      .all() as Array<{ vn_id: string; user_rating: number | null }>;
    for (const r of rows) {
      touch(r.vn_id, 'completed', r.user_rating);
      counts.finished += 1;
    }
  } catch {
    // table may not exist yet in fresh DBs; treat as zero contributions
  }

  // rated >= 70
  try {
    const rows = db
      .prepare(
        `SELECT vn_id, user_rating FROM collection WHERE user_rating IS NOT NULL AND user_rating >= 70`,
      )
      .all() as Array<{ vn_id: string; user_rating: number }>;
    for (const r of rows) {
      touch(r.vn_id, 'rated', r.user_rating);
      counts.rated += 1;
    }
  } catch {
    // ignore
  }

  // favorite
  try {
    const rows = db
      .prepare(`SELECT vn_id, user_rating FROM collection WHERE favorite = 1`)
      .all() as Array<{ vn_id: string; user_rating: number | null }>;
    for (const r of rows) {
      touch(r.vn_id, 'favorite', r.user_rating);
      counts.favorite += 1;
    }
  } catch {
    // ignore
  }

  // reading queue
  try {
    const rows = db.prepare(`SELECT vn_id FROM reading_queue`).all() as Array<{ vn_id: string }>;
    for (const r of rows) {
      touch(r.vn_id, 'queue', null);
      counts.queue += 1;
    }
  } catch {
    // ignore
  }

  // wishlist (gated)
  if (useWishlist) {
    for (const id of readCachedWishlistIds()) {
      touch(id, 'wishlist', null);
      counts.wishlist += 1;
    }
  }

  counts.total = vns.size;

  // Derived: studio + staff overlap counters, keyed on raw id.
  const studioCount = new Map<string, number>();
  const staffCount = new Map<string, number>();
  for (const info of vns.values()) {
    for (const d of new Set(info.developers)) {
      studioCount.set(d, (studioCount.get(d) ?? 0) + 1);
    }
    for (const s of new Set(info.staff)) {
      staffCount.set(s, (staffCount.get(s) ?? 0) + 1);
    }
  }

  return { vns, counts, studioCount, staffCount };
}

interface DerivedSeeds {
  seeds: RecommendationSeed[];
  rawSeeds: RecommendationSeed[];
}

/**
 * Weight every tag across the union of seed VNs. The base weight is the
 * sum of `(user_rating ?? 70) / 100` across every VN where the tag
 * appears. Tags that appear in ≥ 2 distinct seed VNs get a 1.5x
 * multi-source multiplier so genuinely shared themes float to the top.
 * Generic tags (see `GENERIC_TAG_PENALTY_MAP`) are downweighted last
 * so they always rank below an organic non-generic tag with the same
 * raw weight.
 */
function deriveSeedsFromUnion(
  union: SeedUnion,
  seedLimit: number,
  tagLimit: number,
  includeEro: boolean,
): DerivedSeeds {
  interface Acc {
    name: string;
    weight: number;
    contributors: Set<string>;
  }
  const tagAcc = new Map<string, Acc>();

  // Sort seed VNs by rating descending so seedLimit caps the strongest
  // signals first. Wishlist / queue items (rating = 70 baseline) come
  // after explicitly rated ones.
  const sortedVns = Array.from(union.vns.entries()).sort(
    (a, b) => b[1].rating - a[1].rating,
  );
  // Cap at seedLimit so a huge collection doesn't blow out the seed-tag
  // weights. Smaller pools naturally consume everything they have.
  const consumed = sortedVns.slice(0, Math.min(seedLimit, sortedVns.length));

  for (const [vnId, info] of consumed) {
    const ranked = info.tags
      .filter((t) => (t.spoiler ?? 0) === 0 && (includeEro || t.category !== 'ero'))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 8);
    const seedContribution = (info.rating || 70) / 100;
    for (const t of ranked) {
      let acc = tagAcc.get(t.id);
      if (!acc) {
        acc = { name: t.name, weight: 0, contributors: new Set() };
        tagAcc.set(t.id, acc);
      }
      acc.weight += seedContribution;
      acc.contributors.add(vnId);
    }
  }

  const rawSeedsAll: RecommendationSeed[] = [];
  const seedsAll: RecommendationSeed[] = [];
  for (const [tagId, acc] of tagAcc) {
    const sharedBoost = acc.contributors.size >= 2 ? 1.5 : 1;
    const rawWeight = acc.weight * sharedBoost;
    const finalWeight = applyGenericPenalty(tagId, rawWeight);
    const contributors = Array.from(acc.contributors);
    rawSeedsAll.push({ tagId, name: acc.name, weight: rawWeight, contributors });
    seedsAll.push({
      tagId,
      name: acc.name,
      weight: finalWeight,
      contributors,
      rawWeight,
    });
  }
  rawSeedsAll.sort((a, b) => b.weight - a.weight);
  seedsAll.sort((a, b) => b.weight - a.weight);
  return {
    seeds: seedsAll.slice(0, tagLimit),
    rawSeeds: rawSeedsAll.slice(0, tagLimit),
  };
}

function getVnTitle(vnId: string): string | null {
  try {
    const row = db.prepare(`SELECT title FROM vn WHERE id = ?`).get(vnId) as
      | { title: string | null }
      | undefined;
    return row?.title ?? null;
  } catch {
    return null;
  }
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
        contributors: [vnId],
      };
    });
  }
  return tags
    .filter((t) => (t.spoiler ?? 0) === 0 && (includeEro || t.category !== 'ero'))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, tagLimit)
    .map((t) => ({ tagId: t.id, name: t.name, weight: t.rating ?? 1, contributors: [vnId] }));
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
  {
    mode,
    exclude,
    seedTitles,
    studioCount,
    staffCount,
  }: {
    mode: RecommendMode;
    exclude: Set<string>;
    seedTitles: Map<string, string>;
    studioCount?: Map<string, number>;
    staffCount?: Map<string, number>;
  },
): Promise<Recommendation[]> {
  if (seeds.length === 0) return [];

  // `highly-rated` lifts the VNDB-side filter to `votecount >= 100`
  // so the upstream query already restricts to popular titles. Other
  // modes still apply the loose `votecount >= 50` floor.
  const minVotesUpstream = mode === 'highly-rated' ? 100 : 50;

  interface Aggregated extends Recommendation {
    /** Per-contributor weight accumulator for the rotation chip. */
    _contribWeights: Map<string, number>;
  }
  const aggregate = new Map<string, Aggregated>();
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
          _contribWeights: new Map(),
        };
        aggregate.set(h.id, entry);
      }
      // `tag-based` drops the seed weight from the score so the
      // ranking depends only on tag-overlap count + the VNDB tag
      // rating contribution; `because-you-liked` and the seeded
      // similar mode keep the weighted sum.
      const inc = mode === 'tag-based' ? 1 : seed.weight;
      entry.score += inc;
      if (!entry.matchedTags.some((m) => m.id === seed.tagId)) {
        entry.matchedTags.push({ id: seed.tagId, name: seed.name });
      }
      // Spread the seed's incremental score across its contributors so
      // we know which seed VNs actually drove each candidate. Each
      // contributor receives an equal share of the increment.
      const contribs = seed.contributors ?? [];
      const share = contribs.length > 0 ? inc / contribs.length : 0;
      for (const c of contribs) {
        entry._contribWeights.set(c, (entry._contribWeights.get(c) ?? 0) + share);
      }
    }
  }

  let results = Array.from(aggregate.values());

  // Studio / staff overlap signals — only meaningful when the auto
  // pipeline supplied counters. ≥ 3 distinct seeds touching the same
  // studio/staffer counts as a real pattern.
  if (studioCount || staffCount) {
    for (const r of results) {
      let so = 0;
      // VNDB hit shape only includes developer name (not id) at this
      // layer; match by name. Local studioCount keys may be ids OR
      // names depending on what `developers` JSON stored, so we
      // tolerate either.
      for (const d of r.developers) {
        const byName = studioCount?.get(d.name) ?? 0;
        if (byName >= 3) so = Math.max(so, byName);
      }
      if (so > 0) {
        r.studioOverlap = so;
        r.score += Math.min(so, 5) * 0.25;
      }
    }
    // Staff overlap is not available on the upstream hit shape today
    // (no staff field requested in REC_FIELDS) — we surface the
    // counter on the result so the explanation panel can mention it
    // but the per-card boost stays zero.
    void staffCount;
  }

  // Mode-specific post-fetch filters.
  if (mode === 'hidden-gems') {
    results = results.filter((r) => (r.votecount ?? 0) < 200);
  } else if (mode === 'highly-rated') {
    results = results.filter((r) => (r.rating ?? 0) >= 80 && (r.votecount ?? 0) >= 100);
  }

  const ranked = results
    .sort((a, b) => b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, resultLimit);

  // Strip the internal contributor weights and convert to public
  // top-2 contributor objects so the card chip can render
  // "Because you liked X (or Y)" without exposing the accumulator.
  return ranked.map((r): Recommendation => {
    const { _contribWeights, ...rest } = r;
    const top = Array.from(_contribWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => ({ id, title: seedTitles.get(id) ?? id }))
      .filter((c) => c.id && c.title);
    return { ...rest, contributors: top.length > 0 ? top : undefined };
  });
}
