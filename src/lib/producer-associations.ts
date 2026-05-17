import 'server-only';
import { db } from './db';
import { cachedFetch, TTL } from './vndb-cache';

const VNDB_API = 'https://api.vndb.org/kana';

export interface ProducerVnRef {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  image: { url: string; thumbnail: string; sexual?: number } | null;
  owned: boolean;
}

export interface ProducerAssociations {
  /** Producer fetched name (when VNDB returns it). null when unknown / offline. */
  name: string | null;
  developerVns: ProducerVnRef[];
  publisherVns: ProducerVnRef[];
  /** Total unique VNs across both roles (a VN can be both dev + publisher). */
  totalUnique: number;
  ownedUnique: number;
  /** Was the data served from a live VNDB call this run? false = cached. */
  fromCache: boolean;
  /**
   * `true` when neither the developer-credits paginated call nor the
   * publisher-credits paginated call succeeded this run. Callers (the
   * refresh route) can return 502 instead of pretending zero results
   * is the truth.
   */
  upstreamFailed: boolean;
  /**
   * `true` when at least one paginated page was served as a
   * stale-while-error fallback (upstream threw, cache replied). The
   * data is still usable but the UI should surface a "stale" hint
   * so the user knows to retry.
   */
  stale: boolean;
}

interface VndbVnSummary {
  id: string;
  title: string;
  alttitle?: string | null;
  released?: string | null;
  rating?: number | null;
  image?: { url: string; thumbnail: string; sexual?: number } | null;
}

interface VndbReleaseRow {
  id: string;
  vns: { id: string; title?: string; released?: string | null; rating?: number | null; image?: VndbVnSummary['image'] }[];
  producers: { id: string; developer: boolean; publisher: boolean; name?: string | null }[];
}

interface VndbResp<T> {
  results: T[];
  more: boolean;
}

const VN_FIELDS = 'title, alttitle, released, rating, image.url, image.thumbnail, image.sexual';

const RELEASE_FIELDS =
  'producers{id,name,developer,publisher},' +
  'vns{id,title,alttitle,released,rating,image.url,image.thumbnail,image.sexual}';

/**
 * Walk every page (up to `maxPages`) of a VNDB POST query and concat
 * results. Each page is cached individually by `cachedFetch`, so a
 * subsequent run only re-fetches expired pages.
 *
 * `endpoint` is the real VNDB path (e.g. `/vn`, `/release`). `pathTag`
 * is the label used as the cache-key prefix — distinct from the real
 * path so a producer-scoped query (`POST /vn:producer`) doesn't
 * collide with the regular VN search (`POST /vn`).
 */
interface PaginateResult<T> {
  rows: T[];
  /**
   * True when ANY page in this paginated walk was served from a
   * stale-while-error fallback (upstream failed, cache returned the
   * last-known body). Propagated to the caller so the UI can show
   * a "served stale" badge instead of pretending the data is fresh.
   */
  stale: boolean;
}

async function paginatePost<T>(
  endpoint: string,
  pathTag: string,
  baseBody: Record<string, unknown>,
  maxPages: number,
  ttlMs: number,
): Promise<PaginateResult<T>> {
  const out: T[] = [];
  let stale = false;
  for (let page = 1; page <= maxPages; page++) {
    const body = { ...baseBody, page, results: 100 };
    const r = await cachedFetch<VndbResp<T>>(
      `${VNDB_API}${endpoint}`,
      {
        __pathTag: pathTag,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ttlMs },
    );
    if (r.stale) stale = true;
    out.push(...(r.data.results ?? []));
    if (!r.data.more) break;
  }
  return { rows: out, stale };
}

function summarize(v: VndbVnSummary): Omit<ProducerVnRef, 'owned'> {
  return {
    id: v.id,
    title: v.title,
    alttitle: v.alttitle ?? null,
    released: v.released ?? null,
    rating: v.rating ?? null,
    image: v.image ?? null,
  };
}

/**
 * Fetch BOTH developer and publisher credits for a producer, split by
 * role. The local collection is cross-referenced so each VN carries an
 * `owned` flag the UI can use to render "add me" affordances.
 *
 * Why this split exists:
 *   - VNDB's web UI lists every VN connected to a producer on
 *     /producer/<id>, tagged "Developer" or "Publisher".
 *   - The Kana API only exposes the developer relationship at the
 *     /vn level (`developer` filter on POST /vn).
 *   - Publisher relationships only exist on releases — each release's
 *     `producers[]` carries a `publisher: true` flag and the release
 *     points at the VNs it covers via `vns[].id`.
 *   - So we paginate /release with `["producer","=","p123"]`, walk the
 *     returned releases, and aggregate publisher-side VNs by dedupe.
 *
 * A VN that appears as BOTH developer and publisher (self-publishing
 * studios) shows up on the developer side only, so the two sections
 * don't double-count.
 */
export async function fetchProducerAssociations(producerId: string): Promise<ProducerAssociations> {
  if (!/^p\d+$/i.test(producerId)) {
    return {
      name: null,
      developerVns: [],
      publisherVns: [],
      totalUnique: 0,
      ownedUnique: 0,
      fromCache: false,
      upstreamFailed: false,
      stale: false,
    };
  }

  // 1) Developer credits — one page is usually enough (most producers
  //    have < 100 developed VNs); paginate up to 3 just in case. The
  //    pathTag includes the producer id so per-producer wipes don't
  //    nuke every other producer's cached pages.
  let devs: VndbVnSummary[] = [];
  let devsOk = false;
  let devsStale = false;
  try {
    const r = await paginatePost<VndbVnSummary>(
      '/vn',
      `POST /vn:producer:${producerId}`,
      {
        filters: ['developer', '=', ['id', '=', producerId]],
        fields: VN_FIELDS,
        sort: 'released',
        reverse: true,
      },
      3,
      TTL.vnSearch,
    );
    devs = r.rows;
    devsStale = r.stale;
    devsOk = true;
  } catch {
    devs = [];
  }

  // 2) Publisher credits — paginate releases up to 5 pages (500
  //    releases) which covers even the largest publishers. Each
  //    release may map to multiple VNs; dedupe by VN id.
  let releases: VndbReleaseRow[] = [];
  let releasesOk = false;
  let releasesStale = false;
  try {
    const r = await paginatePost<VndbReleaseRow>(
      '/release',
      `POST /release:producer:${producerId}`,
      {
        filters: ['producer', '=', ['id', '=', producerId]],
        fields: RELEASE_FIELDS,
        sort: 'released',
        reverse: true,
      },
      5,
      TTL.releases,
    );
    releases = r.rows;
    releasesStale = r.stale;
    releasesOk = true;
  } catch {
    releases = [];
  }

  // Capture the producer name from BOTH role types. The previous
  // implementation only harvested the name when `role.publisher` was
  // true, which left developer-only producers (lots of doujin
  // circles, indie devs) returning `name: null` and falling back to
  // the bare id ("p17") in the header.
  const pubMap = new Map<string, Omit<ProducerVnRef, 'owned'>>();
  let nameFromUpstream: string | null = null;
  for (const rel of releases) {
    const role = rel.producers?.find((p) => p.id === producerId);
    if (!role) continue;
    if (role.name && !nameFromUpstream) nameFromUpstream = role.name;
    if (!role.publisher) continue;
    for (const v of rel.vns ?? []) {
      if (!v?.id || pubMap.has(v.id)) continue;
      pubMap.set(v.id, summarize(v as VndbVnSummary));
    }
  }

  // Dedupe: VNs that are credited as developer drop out of the
  // publisher list so the two sections stay disjoint.
  const devIds = new Set(devs.map((v) => v.id));
  const publisherOnly = Array.from(pubMap.values()).filter((v) => !devIds.has(v.id));

  const allIds = new Set<string>([...devIds, ...publisherOnly.map((v) => v.id)]);
  const ownedSet = lookupOwned(allIds);

  const developerVns: ProducerVnRef[] = devs.map((v) => ({ ...summarize(v), owned: ownedSet.has(v.id) }));
  const publisherVns: ProducerVnRef[] = publisherOnly.map((v) => ({ ...v, owned: ownedSet.has(v.id) }));

  return {
    name: nameFromUpstream,
    developerVns,
    publisherVns,
    totalUnique: developerVns.length + publisherVns.length,
    ownedUnique: developerVns.filter((v) => v.owned).length + publisherVns.filter((v) => v.owned).length,
    fromCache: false,
    upstreamFailed: !devsOk && !releasesOk,
    stale: devsStale || releasesStale,
  };
}

function lookupOwned(ids: Set<string>): Set<string> {
  if (ids.size === 0) return new Set();
  const arr = Array.from(ids);
  // Chunk so we never approach SQLite's `SQLITE_MAX_VARIABLE_NUMBER`
  // limit, matching the convention in `isInCollectionMany` and
  // `getEgsForVns`.
  const CHUNK = 500;
  const out = new Set<string>();
  for (let i = 0; i < arr.length; i += CHUNK) {
    const chunk = arr.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${placeholders})`)
      .all(...chunk) as { vn_id: string }[];
    for (const r of rows) out.add(r.vn_id);
  }
  return out;
}

/**
 * Bust the VNDB cache rows powering `fetchProducerAssociations` so the
 * next call goes upstream. Used by the "Refresh" button on the producer
 * detail page.
 *
 * The pathTag carries the producer id (`POST /vn:producer:p17`,
 * `POST /release:producer:p17`) so the wipe is scoped — other
 * producers' cached pages survive. Earlier versions wiped every
 * producer's cache on every refresh; that made every adjacent
 * /producer page incur a multi-second blocking re-fetch on the next
 * visit.
 */
export function invalidateProducerAssociations(producerId: string): void {
  if (!/^p\d+$/i.test(producerId)) return;
  db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE ?").run(
    `POST /vn:producer:${producerId}|%`,
  );
  db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE ?").run(
    `POST /release:producer:${producerId}|%`,
  );
}
