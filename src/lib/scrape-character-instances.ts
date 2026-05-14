import 'server-only';
import { db } from './db';
import { fetchVndbWebHtml, htmlToText } from './vndb-scrape';
import { finishJob, recordError, startJob, tickJob } from './download-status';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/**
 * Character "instances" (re-uses of the same character across multiple
 * VN entries) and the per-VN voice-actor mapping live on /c{id}. The
 * Kana API explicitly notes them as Missing. Scrape so the local copy
 * has the full picture.
 *
 * The "Instances" block looks like:
 *   <h1>Instances</h1>
 *   <table class="charlist">
 *     <tr><td><a href="/c12345">Some Name</a> in <a href="/v100">VN Title</a></td></tr>
 *     ...
 *   </table>
 *
 * Voice actors are listed in a per-VN sub-table within the main "Voiced by"
 * section; each row has an <a href="/sNNN"> + an <a href="/vNNN">.
 */

export interface ScrapedCharInstance {
  cid: string;
  name: string;
  vn_id: string;
  vn_title: string;
}

export interface ScrapedCharVoice {
  sid: string;
  staff_name: string;
  vn_id: string;
  vn_title: string;
  note: string | null;
}

export interface ScrapedCharacterInfo {
  cid: string;
  instances: ScrapedCharInstance[];
  voiced_by: ScrapedCharVoice[];
  fetched_at: number;
}

const CACHE_KEY = (cid: string) => `scrape_character:${cid.toLowerCase()}`;

export function readScrapedCharacterInfo(cid: string): ScrapedCharacterInfo | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(CACHE_KEY(cid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as ScrapedCharacterInfo;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function write(cid: string, info: ScrapedCharacterInfo): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(CACHE_KEY(cid), JSON.stringify(info), now, now + 30 * 24 * 3600 * 1000);
}

const INSTANCES_BLOCK_RE = /<h1[^>]*>Instances<\/h1>\s*<table[^>]*>([\s\S]*?)<\/table>/i;
const VOICED_BLOCK_RE = /<h2[^>]*>Voiced by<\/h2>([\s\S]*?)(?:<h1|<h2|$)/i;
const TR_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const C_LINK_RE = /<a href="\/(c\d+)"[^>]*>([\s\S]*?)<\/a>/i;
const S_LINK_RE = /<a href="\/(s\d+)"[^>]*>([\s\S]*?)<\/a>/i;
const V_LINK_RE = /<a href="\/(v\d+)"[^>]*>([\s\S]*?)<\/a>/i;

export async function scrapeCharacterInfo(
  cid: string,
  opts: { force?: boolean } = {},
): Promise<ScrapedCharacterInfo | null> {
  if (!/^c\d+$/i.test(cid)) return null;
  const html = await fetchVndbWebHtml(`/${cid.toLowerCase()}`, opts);
  if (!html) return null;

  const instances: ScrapedCharInstance[] = [];
  const instM = INSTANCES_BLOCK_RE.exec(html);
  if (instM) {
    for (const m of instM[1].matchAll(TR_RE)) {
      const inner = m[1];
      const cLink = C_LINK_RE.exec(inner);
      const vLink = V_LINK_RE.exec(inner);
      if (!cLink || !vLink) continue;
      instances.push({
        cid: cLink[1],
        name: htmlToText(cLink[2]),
        vn_id: vLink[1],
        vn_title: htmlToText(vLink[2]),
      });
    }
  }

  const voiced: ScrapedCharVoice[] = [];
  const vBlock = VOICED_BLOCK_RE.exec(html);
  if (vBlock) {
    for (const m of vBlock[1].matchAll(TR_RE)) {
      const inner = m[1];
      const sLink = S_LINK_RE.exec(inner);
      const vLink = V_LINK_RE.exec(inner);
      if (!sLink || !vLink) continue;
      voiced.push({
        sid: sLink[1],
        staff_name: htmlToText(sLink[2]),
        vn_id: vLink[1],
        vn_title: htmlToText(vLink[2]),
        note: null,
      });
    }
  }

  const info: ScrapedCharacterInfo = {
    cid: cid.toLowerCase(),
    instances,
    voiced_by: voiced,
    fetched_at: Date.now(),
  };
  write(cid, info);
  return info;
}

export async function scrapeCharactersForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  const rows = db
    .prepare(`SELECT DISTINCT c_id FROM vn_va_credit WHERE vn_id = ?`)
    .all(vnId) as { c_id: string }[];
  const ids = rows.map((r) => r.c_id).filter((s) => /^c\d+$/i.test(s));
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = opts.force
    ? ids
    : ids.filter((cid) => {
        const cached = readScrapedCharacterInfo(cid);
        return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
      });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', `Character instances for ${vnId}`, stale.length, vnId);
  let downloaded = 0;
  for (const cid of stale) {
    try {
      const r = await scrapeCharacterInfo(cid, opts);
      if (r) downloaded++;
    } catch (e) {
      recordError(job.id, cid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}
