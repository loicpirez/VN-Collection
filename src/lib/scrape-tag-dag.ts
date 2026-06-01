import 'server-only';
import { db } from './db';
import { fetchVndbWebHtml, htmlToText } from './vndb-scrape';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonArray, parseJsonRecord } from './json-shape';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/**
 * R5-216: VNDB hierarchy gap. The tag system on VNDB is a DAG —
 * each tag can have multiple parents and children. The Kana API
 * (see https://api.vndb.org/kana) exposes `POST /tag` but the
 * response carries only the tag's own metadata; there is no
 * parent / child relationship surface anywhere in the KANA
 * schema. The graph lives only on the public HTML `/g{id}`
 * page. Scrape it so the user's local copy isn't truncated.
 *
 * Parents live in <li class="parent"> entries; children sit in
 * the table underneath. We capture every linked tag id on the
 * page that isn't the tag itself and classify by which UL/section
 * they live in.
 */

export interface ScrapedTagDagNode {
  id: string;
  name: string;
}

export interface ScrapedTagDag {
  gid: string;
  parents: ScrapedTagDagNode[];
  children: ScrapedTagDagNode[];
  fetched_at: number;
}

const CACHE_KEY = (gid: string) => `scrape_tag:${gid.toLowerCase()}`;

function isScrapedTagDagNode(value: unknown): value is ScrapedTagDagNode {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && /^g\d+$/i.test(row.id)
    && typeof row.name === 'string';
}

function decodeScrapedTagDag(raw: string, fetchedAt: number): ScrapedTagDag | null {
  const parsed = parseJsonRecord(raw);
  if (
    parsed === null
    || typeof parsed.gid !== 'string'
    || !/^g\d+$/i.test(parsed.gid)
    || !Array.isArray(parsed.parents)
    || !parsed.parents.every(isScrapedTagDagNode)
    || !Array.isArray(parsed.children)
    || !parsed.children.every(isScrapedTagDagNode)
  ) {
    return null;
  }
  return {
    gid: parsed.gid,
    parents: parsed.parents,
    children: parsed.children,
    fetched_at: fetchedAt,
  };
}

/**
 * Read the cached parent/child DAG for a tag id, or `null` when absent or
 * unparseable. Used as a fast pre-render path so tag pages don't block on
 * a VNDB scrape.
 */
export function readScrapedTagDag(gid: string): ScrapedTagDag | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(CACHE_KEY(gid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  return decodeScrapedTagDag(row.body, row.fetched_at);
}

function write(gid: string, dag: ScrapedTagDag): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(CACHE_KEY(gid), JSON.stringify(dag), now, now + 30 * 24 * 3600 * 1000);
}

const PARENTS_BLOCK_RE = /<h2[^>]*>Parent Tags<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i;
const CHILDREN_BLOCK_RE = /<h2[^>]*>Child Tags<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i;
const TAG_LINK_RE = /<a href="\/(g\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

function parseList(block: string | undefined, selfId: string): ScrapedTagDagNode[] {
  if (!block) return [];
  const out: ScrapedTagDagNode[] = [];
  const seen = new Set<string>();
  for (const m of block.matchAll(TAG_LINK_RE)) {
    const id = m[1];
    if (id === selfId || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: htmlToText(m[2]) });
  }
  return out;
}

/**
 * Scrape the VNDB `/g<id>` page for one tag's Parents / Children block and
 * persist the result. Returns `null` for malformed ids or when the page is
 * unreachable so callers can degrade gracefully.
 */
export async function scrapeTagDag(
  gid: string,
  opts: { force?: boolean } = {},
): Promise<ScrapedTagDag | null> {
  if (!/^g\d+$/i.test(gid)) return null;
  const html = await fetchVndbWebHtml(`/${gid.toLowerCase()}`, opts);
  if (!html) return null;
  const parentsM = PARENTS_BLOCK_RE.exec(html);
  const childrenM = CHILDREN_BLOCK_RE.exec(html);
  const dag: ScrapedTagDag = {
    gid: gid.toLowerCase(),
    parents: parseList(parentsM?.[1], gid.toLowerCase()),
    children: parseList(childrenM?.[1], gid.toLowerCase()),
    fetched_at: Date.now(),
  };
  write(gid, dag);
  return dag;
}

/**
 * Fan-out: scrape every tag attached to a VN so the tag detail tree on the
 * VN page can render without blocking. Skips fresh cache entries unless
 * `force: true`.
 */
export async function scrapeTagDagForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  const row = db
    .prepare('SELECT tags FROM vn WHERE id = ?')
    .get(vnId) as { tags: string | null } | undefined;
  if (!row?.tags) return { scanned: 0, downloaded: 0 };
  const ids = Array.from(new Set(
    parseJsonArray(row.tags)
      .map((tag) => asJsonRecord(tag)?.id)
      .filter((id): id is string => typeof id === 'string' && /^g\d+$/i.test(id))
      .map((id) => id.toLowerCase()),
  ));
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = opts.force
    ? ids
    : ids.filter((gid) => {
        const cached = readScrapedTagDag(gid);
        return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
      });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('tag_graph_for_vn', `Tag graph for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const gid of stale) {
    try {
      const r = await scrapeTagDag(gid, opts);
      if (r) downloaded++;
    } catch (e) {
      recordError(job.id, gid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}
