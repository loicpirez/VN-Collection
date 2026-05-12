import 'server-only';
import { db } from './db';
import { cachedFetch, TTL } from './vndb-cache';

const VNDB_API = 'https://api.vndb.org/kana';

export interface UpcomingRelease {
  id: string;
  title: string;
  alttitle: string | null;
  released: string;
  languages: string[];
  platforms: string[];
  producers: { id: string; name: string }[];
  /** VNs this release is linked to — caller decides what to surface. */
  vns: { id: string; title: string; image: { url: string; thumbnail?: string; sexual?: number } | null }[];
  patch: boolean;
  freeware: boolean;
  has_ero: boolean;
}

const REL_FIELDS = [
  'title',
  'alttitle',
  'released',
  'languages{lang}',
  'platforms',
  'patch',
  'freeware',
  'has_ero',
  'producers{id,name,developer}',
  'vns{id,title,image.url,image.thumbnail,image.sexual}',
].join(', ');

/**
 * Pull the set of producer ids that show up as developers in the user's
 * collection. We watch those developers' upcoming releases — sequels and
 * new entries are the most useful "what's next" signal for a personal
 * library.
 */
function watchedProducerIds(): string[] {
  const rows = db.prepare(`SELECT developers FROM vn`).all() as { developers: string | null }[];
  const set = new Set<string>();
  for (const r of rows) {
    if (!r.developers) continue;
    try {
      const parsed = JSON.parse(r.developers) as { id?: string }[];
      for (const d of parsed) if (d.id) set.add(d.id);
    } catch {
      // ignore malformed rows — old schema leftover
    }
  }
  return Array.from(set);
}

/**
 * Fetch upcoming releases produced by any developer in the user's library.
 * Splits the producer-id list into batches of 50 to stay below VNDB's
 * filter-predicate cap and keep individual queries small.
 *
 * Returns ordered by release date ascending; caller is free to group by
 * month for the UI.
 */
export async function fetchUpcomingForCollection(): Promise<UpcomingRelease[]> {
  const ids = watchedProducerIds();
  if (ids.length === 0) return [];
  const batchSize = 50;
  const today = new Date().toISOString().slice(0, 10);
  const aggregate = new Map<string, UpcomingRelease>();

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const producerFilter = batch.length === 1
      ? ['producer', '=', ['id', '=', batch[0]]]
      : ['or', ...batch.map((id) => ['producer', '=', ['id', '=', id]])];
    const filters = [
      'and',
      ['released', '>=', today],
      producerFilter,
    ];
    const body = {
      filters,
      fields: REL_FIELDS,
      sort: 'released',
      reverse: false,
      results: 100,
    };
    const r = await cachedFetch<{ results: UpcomingRelease[]; more: boolean }>(
      `${VNDB_API}/release`,
      {
        __pathTag: 'POST /release:upcoming',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ttlMs: TTL.releases },
    );
    for (const rel of r.data.results) {
      if (!aggregate.has(rel.id)) aggregate.set(rel.id, rel);
    }
  }

  return Array.from(aggregate.values()).sort((a, b) => a.released.localeCompare(b.released));
}

/**
 * Pull upcoming VNDB releases unrestricted by the user's collection. Useful
 * for "what's coming up everywhere" panes. Limited to the next 12 months so
 * the result stays bounded; ordered by release date ascending.
 */
export async function fetchAllUpcomingFromVndb(limit = 200): Promise<UpcomingRelease[]> {
  const today = new Date().toISOString().slice(0, 10);
  const yearAhead = new Date();
  yearAhead.setUTCFullYear(yearAhead.getUTCFullYear() + 1);
  const horizon = yearAhead.toISOString().slice(0, 10);

  const aggregate = new Map<string, UpcomingRelease>();
  const safe = Math.min(500, Math.max(50, Math.floor(limit)));
  const pageSize = 100;
  let page = 1;
  while (aggregate.size < safe && page <= 5) {
    const body = {
      filters: ['and', ['released', '>=', today], ['released', '<=', horizon]],
      fields: REL_FIELDS,
      sort: 'released',
      reverse: false,
      results: pageSize,
      page,
    };
    const r = await cachedFetch<{ results: UpcomingRelease[]; more: boolean }>(
      `${VNDB_API}/release`,
      {
        __pathTag: 'POST /release:upcoming-all',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ttlMs: TTL.releases },
    );
    for (const rel of r.data.results) {
      if (!aggregate.has(rel.id)) aggregate.set(rel.id, rel);
      if (aggregate.size >= safe) break;
    }
    if (!r.data.more) break;
    page += 1;
  }

  return Array.from(aggregate.values()).sort((a, b) => a.released.localeCompare(b.released));
}
