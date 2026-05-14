import 'server-only';
import { db } from './db';
import { fetchVndbWebHtml, htmlToText } from './vndb-scrape';

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

export function readScrapedProducerInfo(pid: string): ScrapedProducerInfo | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(CACHE_KEY(pid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as ScrapedProducerInfo;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function writeScrapedProducerInfo(pid: string, info: ScrapedProducerInfo): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(CACHE_KEY(pid), JSON.stringify(info), now, now + 30 * 24 * 3600 * 1000);
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
  writeScrapedProducerInfo(pid, info);
  return info;
}

export async function scrapeProducersForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  const row = db
    .prepare('SELECT developers FROM vn WHERE id = ?')
    .get(vnId) as { developers: string | null } | undefined;
  if (!row?.developers) return { scanned: 0, downloaded: 0 };
  let devs: { id: string }[] = [];
  try {
    devs = JSON.parse(row.developers);
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  const ids = Array.from(new Set(devs.map((d) => d.id).filter((s) => /^p\d+$/i.test(s))));
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  let downloaded = 0;
  for (const pid of ids) {
    try {
      const r = await scrapeProducerRelations(pid, opts);
      if (r) downloaded++;
    } catch {
      // best-effort; skip
    }
  }
  return { scanned: ids.length, downloaded };
}
