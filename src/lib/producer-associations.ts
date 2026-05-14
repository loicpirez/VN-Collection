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
async function paginatePost<T>(
  endpoint: string,
  pathTag: string,
  baseBody: Record<string, unknown>,
  maxPages: number,
  ttlMs: number,
): Promise<T[]> {
  const out: T[] = [];
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
    out.push(...(r.data.results ?? []));
    if (!r.data.more) break;
  }
  return out;
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
 * role. The user's collection is cross-referenced so each VN carries an
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
    return { name: null, developerVns: [], publisherVns: [], totalUnique: 0, ownedUnique: 0, fromCache: false };
  }

  // 1) Developer credits — one page is usually enough (most producers
  //    have < 100 developed VNs); paginate up to 3 just in case.
  let devs: VndbVnSummary[] = [];
  try {
    devs = await paginatePost<VndbVnSummary>(
      '/vn',
      'POST /vn:producer',
      {
        filters: ['developer', '=', ['id', '=', producerId]],
        fields: VN_FIELDS,
        sort: 'released',
        reverse: true,
      },
      3,
      TTL.vnSearch,
    );
  } catch {
    devs = [];
  }

  // 2) Publisher credits — paginate releases up to 5 pages (500
  //    releases) which covers even the largest publishers. Each
  //    release may map to multiple VNs; dedupe by VN id.
  let releases: VndbReleaseRow[] = [];
  try {
    releases = await paginatePost<VndbReleaseRow>(
      '/release',
      'POST /release:producer',
      {
        filters: ['producer', '=', ['id', '=', producerId]],
        fields: RELEASE_FIELDS,
        sort: 'released',
        reverse: true,
      },
      5,
      TTL.releases,
    );
  } catch {
    releases = [];
  }

  const pubMap = new Map<string, Omit<ProducerVnRef, 'owned'>>();
  let nameFromRelease: string | null = null;
  for (const rel of releases) {
    const role = rel.producers?.find((p) => p.id === producerId);
    if (!role) continue;
    if (role.name && !nameFromRelease) nameFromRelease = role.name;
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
    name: nameFromRelease,
    developerVns,
    publisherVns,
    totalUnique: developerVns.length + publisherVns.length,
    ownedUnique: developerVns.filter((v) => v.owned).length + publisherVns.filter((v) => v.owned).length,
    fromCache: false,
  };
}

function lookupOwned(ids: Set<string>): Set<string> {
  if (ids.size === 0) return new Set();
  const arr = Array.from(ids);
  const placeholders = arr.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${placeholders})`)
    .all(...arr) as { vn_id: string }[];
  return new Set(rows.map((r) => r.vn_id));
}

/**
 * Bust the VNDB cache rows powering `fetchProducerAssociations` so the
 * next call goes upstream. Used by the "Refresh" button on the producer
 * detail page.
 */
export function invalidateProducerAssociations(producerId: string): void {
  // Cache keys for the two endpoints we paginate. The hash component
  // depends on the body (filters + page), so we wipe by the path tag
  // prefix to cover every page.
  db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /vn:producer|%'").run();
  db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /release:producer|%'").run();
  // The `producerId` argument is intentionally unused — the per-page
  // hash makes targeting a specific producer's rows messy. Wiping the
  // entire path is cheap (rows for OTHER producers re-populate
  // organically on their next visit).
  void producerId;
}
