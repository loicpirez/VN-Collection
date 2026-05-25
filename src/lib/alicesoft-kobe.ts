import 'server-only';
import { searchVn } from './vndb';
import { fetchEgsGame, searchEgsByName } from './erogamescape';
import { providerFetch } from './proxy-fetch';
import { isVndbVnId } from './vn-id-shape';
import {
  countKobeStock,
  listKobeNoVndbResult,
  listKobeUnmatched,
  resetKobeAutoMatches as dbResetKobeAutoMatches,
  setKobeEgsLink,
  setKobeVnLink,
  upsertKobeStock,
  type KobeStockRow,
} from './db';

const ALICE_KOBE_URL = 'https://www.alice-kobe.com/html/page4.html';
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const TAG_RE = /<[^>]+>/g;

export interface KobeCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

function stripTags(html: string): string {
  return html.replace(TAG_RE, '').trim();
}

/**
 * Normalize a raw Kobe title for use as a VNDB/EGS search query.
 * Strips used-goods markers, edition/platform labels, age-rating tags,
 * and converts full-width ASCII to half-width so the search engine
 * receives the cleanest possible game title.
 */
export function normalizeTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[【〔\[（(][^\]】〕)）]*中古[^\]】〕)）]*[\]】〕)）]/g, '')
    .replace(/中古品?/g, '')
    .replace(/[【〔\[（(][^\]】〕)）]*(Windows?|Win|PC|同人|R18|18禁|全年齢|成人向け|DVD-ROM|Download|DL版|ダウンロード)[^\]】〕)）]*[\]】〕)）]/gi, '')
    .replace(/[\[(（【〔]18禁[\])）】〕]/g, '')
    .replace(/[\[(（【〔]全年齢[\])）】〕]/g, '')
    .replace(/\s*(通常版|限定版|初回限定版|初回版|特典付き?|豪華版|スペシャル版|コレクターズ版|デラックス版|完全版)\s*/g, '')
    .replace(/\s*Ver\.?\s*[\d.]+\s*/gi, '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export { normalizeTitle as getKobeTitleForSearch };

/**
 * Parse the Alice Kobe HTML page into structured stock rows.
 * Skips the header row and any rows without the expected code format.
 */
export function parseAliceKobeHtml(
  html: string,
): Pick<KobeStockRow, 'code' | 'title' | 'jan' | 'release_date' | 'list_price' | 'sale_price'>[] {
  const results: Pick<KobeStockRow, 'code' | 'title' | 'jan' | 'release_date' | 'list_price' | 'sale_price'>[] = [];
  ROW_RE.lastIndex = 0;
  let rm: RegExpExecArray | null;
  let isFirst = true;
  while ((rm = ROW_RE.exec(html)) !== null) {
    const cells: string[] = [];
    CELL_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = CELL_RE.exec(rm[1])) !== null) {
      cells.push(stripTags(cm[1]));
    }
    if (cells.length < 6) continue;
    if (isFirst) {
      isFirst = false;
      if (cells[0].includes('商品コード') || cells[0].includes('ｺｰﾄﾞ') || cells[0] === 'code' || /^[＀-￯]+$/.test(cells[0])) continue;
    }
    const code = cells[0];
    if (!code || !/^\d{3}-\d{6}-\d{3}$/.test(code)) continue;
    results.push({
      code,
      title: cells[1],
      jan: cells[2] || null,
      release_date: cells[3] || null,
      list_price: cells[4] || null,
      sale_price: cells[5] || null,
    });
  }
  return results;
}

/**
 * Fetch the Alice Kobe stock page, decoding EUC-JP to UTF-8.
 * Only called on explicit user action — never auto-fetched on page load.
 */
export async function fetchAliceKobeHtml(): Promise<string> {
  const res = await providerFetch(
    ALICE_KOBE_URL,
    { headers: { 'User-Agent': 'vndb-collection/1.0 (personal use)' } },
    'alicesoft_kobe',
  );
  if (!res.ok) throw new Error(`Alice Kobe fetch failed: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder('euc-jp');
  return decoder.decode(buffer);
}

/**
 * Download the latest stock from Alice Kobe and persist it to the DB.
 * Triggered only by the Download button — never called automatically.
 */
export async function refreshKobeStock(): Promise<{
  count: number;
  added: number;
  updated: number;
  removed: number;
  fetched_at: number;
}> {
  const html = await fetchAliceKobeHtml();
  const rows = parseAliceKobeHtml(html);
  const { added, updated, removed } = upsertKobeStock(rows);
  return { count: rows.length, added, updated, removed, fetched_at: Date.now() };
}

/**
 * Reset all auto-matched VN links so they can be re-matched.
 * Manual links (source='manual') are preserved.
 * Returns the number of rows cleared.
 */
export function resetKobeAutoMatches(): number {
  return dbResetKobeAutoMatches();
}

/**
 * Auto-match a batch of unlinked Kobe items against VNDB and EGS.
 *
 * Rate-limiting strategy:
 *   - VNDB: handled by the shared throttle queue (≤ 1 req/s); no extra sleep needed.
 *   - EGS:  runs concurrently with VNDB via Promise.all — zero added latency.
 *   - Both APIs cache results, so repeated identical queries are free.
 *
 * Stores up to 3 VNDB candidates per item for quick-pick remapping in the UI.
 * The first candidate is auto-selected as `vn_id`; the user can pick another.
 *
 * @param batchSize  Number of items to process (clamped 1–100)
 * @param retryNone  When true, also retries items previously marked 'none'
 */
export async function matchNextKobeItems(
  batchSize: number,
  retryNone = false,
): Promise<{ processed: number; remaining: number }> {
  const safe = Math.min(100, Math.max(1, Math.floor(batchSize)));
  const items = listKobeUnmatched(safe, retryNone);
  for (const item of items) {
    const query = normalizeTitle(item.title);
    if (!query) {
      setKobeVnLink(item.code, null, 'none', null, item.title);
      continue;
    }
    await Promise.all([
      searchVn(query, { results: 3 })
        .then((vnResult) => {
          const candidates: KobeCandidate[] = (vnResult.results ?? []).slice(0, 3).map((v) => ({
            id: v.id,
            title: v.title,
            alttitle: v.alttitle,
            released: v.released,
          }));
          const top = candidates[0];
          const candidatesJson = candidates.length > 0 ? JSON.stringify(candidates) : null;
          setKobeVnLink(item.code, top?.id ?? null, top ? 'auto' : 'none', candidatesJson, query);
        })
        .catch(() => {}),
      searchEgsByName(query)
        .then((r) => { if (r) setKobeEgsLink(item.code, r.id, 'auto'); })
        .catch(() => {}),
    ]);
  }
  const stats = countKobeStock();
  return {
    processed: items.length,
    remaining: retryNone ? stats.unmatched + stats.none_found : stats.unmatched,
  };
}

/**
 * Resolve VNDB ids for items in the "No VNDB result" tab via ErogameScape.
 *
 * Walks every kobe row where `vn_match_source = 'none' AND vn_id IS NULL`
 * (i.e. title search against VNDB previously returned nothing). For each:
 *  1. If we don't yet have an `egs_id`, run a fresh `searchEgsByName` and
 *     persist whatever it finds.
 *  2. If we now have an `egs_id`, call `fetchEgsGame` (24h cached) and read
 *     the curated `vndb` column. Valid VN ids are written back via
 *     `setKobeVnLink`.
 *
 * Failures (EGS unreachable, no matching EGS row, EGS row with empty `vndb`)
 * are intentionally left untouched — the row stays as 'none' and the user
 * can manually link it. Returns `remaining: 0` unconditionally so the UI's
 * batch loop terminates after a single pass.
 *
 * @param batchSize  Max number of rows to process this call (clamped 1–500)
 */
export async function matchVndbFromEgsForKobe(
  batchSize: number,
): Promise<{ processed: number; matched: number; remaining: number }> {
  const safe = Math.min(500, Math.max(1, Math.floor(batchSize)));
  const items = listKobeNoVndbResult(safe);
  let matched = 0;
  for (const item of items) {
    let egsId = item.egs_id;
    // Step 1: if EGS title search hasn't been tried yet (or returned null),
    // try again now. This is the same query used during match-next.
    if (egsId == null) {
      const query = normalizeTitle(item.title);
      if (!query) continue;
      try {
        const r = await searchEgsByName(query);
        if (r) {
          egsId = r.id;
          setKobeEgsLink(item.code, egsId, 'auto');
        }
      } catch {
        // EGS unreachable for this query — skip and let the user retry.
      }
    }
    if (egsId == null) continue;
    // Step 2: read the EGS row's curated `vndb` column.
    try {
      const game = await fetchEgsGame(egsId);
      const vndbRaw = game?.raw?.vndb?.trim() ?? '';
      if (game && isVndbVnId(vndbRaw)) {
        setKobeVnLink(item.code, vndbRaw, 'auto', null, item.search_title ?? item.title);
        matched++;
      }
    } catch {
      // EGS unreachable for this id — leave row as 'none', user can retry.
    }
  }
  // remaining is intentionally 0 so the front-end runLoop exits after one
  // pass — re-running would just re-process the same failed rows.
  return { processed: items.length, matched, remaining: 0 };
}
