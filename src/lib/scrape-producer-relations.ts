import 'server-only';
import { fetchVndbWebHtml, htmlToText } from './vndb-scrape';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getProducerRepository } from './db/repositories/producer';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/**
 * Producer relations (parent brand / subsidiary / spawned / imprint /
 * formerly / staff entry / parent producer) are listed on each
 * vndb.org/p{id} page but explicitly absent from POST /producer. Scrape
 * the public page so "Download all" really pulls everything VNDB has.
 *
 * The relations live in the `<table class="stripe">` block under the
 * "Relations" header. Each row is a `<tr>` with a `<td class="key">`
 * label and a `<td>` containing a `<a href="/p123">…</a>`.
 */

export interface ScrapedProducerRelation {
  relation: string;
  id: string;
  name: string;
}

export interface ScrapedProducerInfo {
  pid: string;
  relations: ScrapedProducerRelation[];
  fetched_at: number;
}

const CACHE_KEY = (pid: string) => `scrape_producer:${pid.toLowerCase()}`;

function isScrapedProducerRelation(value: unknown): value is ScrapedProducerRelation {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.relation === 'string'
    && typeof row.id === 'string'
    && /^p\d+$/i.test(row.id)
    && typeof row.name === 'string';
}

function decodeScrapedProducerInfo(raw: string, fetchedAt: number): ScrapedProducerInfo | null {
  const parsed = parseJsonRecord(raw);
  if (
    parsed === null
    || typeof parsed.pid !== 'string'
    || !/^p\d+$/i.test(parsed.pid)
    || !Array.isArray(parsed.relations)
    || !parsed.relations.every(isScrapedProducerRelation)
  ) {
    return null;
  }
  return {
    pid: parsed.pid,
    relations: parsed.relations,
    fetched_at: fetchedAt,
  };
}

/**
 * Read the cached scraped relations payload for a producer, or `null` when
 * absent / unparseable. Cache is keyed by lowercased pid and stored in
 * `vndb_cache` so it shares the same invalidation surface as the API cache.
 */
function decodeScrapedProducerCacheRow(
  row: Pick<CacheRow, 'body' | 'fetched_at'> | null,
): ScrapedProducerInfo | null {
  if (!row) return null;
  return decodeScrapedProducerInfo(row.body, row.fetched_at);
}

export async function readScrapedProducerInfo(pid: string): Promise<ScrapedProducerInfo | null> {
  return decodeScrapedProducerCacheRow(await getCacheRepository().get(CACHE_KEY(pid)));
}

async function writeScrapedProducerInfo(pid: string, info: ScrapedProducerInfo): Promise<void> {
  const now = Date.now();
  await getCacheRepository().put({
    cache_key: CACHE_KEY(pid),
    body: JSON.stringify(info),
    etag: null,
    last_modified: null,
    fetched_at: now,
    expires_at: now + 30 * 24 * 3600 * 1000,
  });
}

const RELATIONS_BLOCK_RE = /<h1[^>]*>Relations<\/h1>\s*<table[^>]*>([\s\S]*?)<\/table>/i;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const KEY_RE = /<td class="key"[^>]*>([\s\S]*?)<\/td>/i;
const LINK_RE = /<a href="\/(p\d+)"[^>]*>([\s\S]*?)<\/a>/i;

/**
 * Pull /p{id} from vndb.org, parse the Relations table. Returns null when
 * the page has no relations block (most producers).
 */
export async function scrapeProducerRelations(
  pid: string,
  opts: { force?: boolean } = {},
): Promise<ScrapedProducerInfo | null> {
  if (!/^p\d+$/i.test(pid)) return null;
  const html = await fetchVndbWebHtml(`/${pid.toLowerCase()}`, opts);
  if (!html) return null;

  const block = RELATIONS_BLOCK_RE.exec(html);
  const relations: ScrapedProducerRelation[] = [];
  if (block) {
    for (const m of block[1].matchAll(ROW_RE)) {
      const inner = m[1];
      const keyM = KEY_RE.exec(inner);
      const linkM = LINK_RE.exec(inner);
      if (!keyM || !linkM) continue;
      relations.push({
        relation: htmlToText(keyM[1]).replace(/:$/, ''),
        id: linkM[1],
        name: htmlToText(linkM[2]),
      });
    }
  }

  const info: ScrapedProducerInfo = {
    pid: pid.toLowerCase(),
    relations,
    fetched_at: Date.now(),
  };
  await writeScrapedProducerInfo(pid, info);
  return info;
}

/**
 * Fan-out: for every developer credited on `vnId`, scrape its VNDB
 * producer page so the Relations panel can render without N round-trips.
 * Skips entries whose cache is still fresh unless `force` is set.
 */
export async function scrapeProducersForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  const ids = await getProducerRepository().developerIdsForVn(vnId);
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const cacheRows = opts.force
    ? new Map<string, CacheRow>()
    : await getCacheRepository().getMany(ids.map(CACHE_KEY));
  const stale = opts.force
    ? ids
    : ids.filter((pid) => {
        const cached = decodeScrapedProducerCacheRow(cacheRows.get(CACHE_KEY(pid)) ?? null);
        return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
      });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('producer_relations_for_vn', `Producer relations for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const pid of stale) {
    try {
      const r = await scrapeProducerRelations(pid, opts);
      if (r) downloaded++;
    } catch (e) {
      recordError(job.id, pid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}
