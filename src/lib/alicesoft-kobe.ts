import 'server-only';
import { searchVn } from './vndb';
import { fetchEgsGame, searchEgsByName } from './erogamescape';
import { providerFetch } from './proxy-fetch';
import { isVndbVnId } from './vn-id-shape';
import {
  countKobeNoVndbResult,
  countKobeNoVndbNoEgs,
  countKobeNoVndbWithEgs,
  countKobeUnmatchedQueue,
  countKobeStock,
  listKobeNoVndbWithEgs,
  listKobeNoVndbNoEgs,
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
const MAX_KOBE_QUERY_VARIANTS = 8;

export interface KobeCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

function stripTags(html: string): string {
  return html.replace(TAG_RE, '').trim();
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function tidySpaces(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([!?,.:;])/g, '$1')
    .replace(/([(~「『])\s+/g, '$1')
    .replace(/\s+([)」』])/g, '$1')
    .trim();
}

function normalizePunctuation(rawTitle: string): string {
  return rawTitle
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[〜～]/g, '~')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/　/g, ' ');
}

function stripUsedAndPlatformMarkers(title: string): string {
  return title
    .replace(/[【〔\[(（][^\]】〕)）]*中古[^\]】〕)）]*[\]】〕)）]/g, '')
    .replace(/中古品?/g, '')
    .replace(/[【〔\[(（][^\]】〕)）]*(Windows?|Win|PC|同人|R18|18禁|全年齢|成人向け|DVD-?ROM|CD-?ROM|Download|DL版|ダウンロード)[^\]】〕)）]*[\]】〕)）]/gi, '')
    .replace(/[\[(（【〔]18禁[\])）】〕]/g, '')
    .replace(/[\[(（【〔]全年齢[\])）】〕]/g, '');
}

function stripKnownTrailingDescriptors(title: string): string {
  let t = title;
  let prev = '';
  while (prev !== t) {
    prev = t;
    t = tidySpaces(t
      .replace(/(?:\s|^)(?:DVD-?ROM|CD-?ROM|DVD|Blu-?ray)\s*版?$/i, '')
      .replace(/(?:通常|限定|初回(?:限定(?:生産)?)?|完全(?:限定|生産)?限定?|豪華(?:限定)?|特装|特別(?:限定)?|普及|廉価|復刻|再販|再発売|アウトレット)\s*版$/u, '')
      .replace(/(?:初回限|初回生産限定|完全限定生産|完全生産限定|豪華限定|通常|限定|豪華|普及|廉価|復刻|再販|アウトレット)$/u, '')
      .replace(/(?:Standard|Full|Extended|Limited|Collector'?s)\s*Edition$/i, '')
      .replace(/(?:スタンダード|プレミアム|スペシャル|デラックス|ギャラクシー|クオリティ)\s*(?:エディション|版)?$/u, '')
      .replace(/(?:リマスター|エンハンスド|フルHD|HDサイズ|FHD|HD)\s*(?:エディション|版)?$/iu, '')
      .replace(/(?:パッケージ|ボックス|BOX\s*SET|BOX|セット|パック|Collection\s*Pack|Wパック)$/iu, '')
      .replace(/(?:抱き枕カバー付|タペストリー付|ラフアートブック付|オナホール同梱|通販テレカ付|トールケース版|マキシCD同梱|F&Cカード付|F&Cカード無).*$/iu, '')
      .replace(/全年齢対象$/u, '')
      .replace(/復刻$/u, ''));
  }
  return t;
}

function hasJapanese(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function insertCamelSpacing(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\b([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
}

function withoutDecorativeSubtitle(value: string): string[] {
  const out: string[] = [];
  const t = tidySpaces(value);

  const bracketDash = /^(.{2,}?)\s*-\s*[^-~]{2,}\s*-?\s*$/u.exec(t);
  if (bracketDash?.[1]) out.push(tidySpaces(bracketDash[1]));

  const bracketTilde = /^(.{2,}?)\s*~\s*[^~]{2,}\s*~\s*$/u.exec(t);
  if (bracketTilde?.[1]) out.push(tidySpaces(bracketTilde[1]));

  if (hasJapanese(t)) {
    out.push(tidySpaces(t.replace(/\s+[A-Za-z][A-Za-z0-9'&+×.,!?() /-]{3,}$/u, '')));
  }

  return out.filter((v) => v && v !== t);
}

function withoutFandiscMarker(value: string): string | null {
  const m = /^(.{2,}?)\s+(?:ミニ\s*)?(?:FD|ファンディスク|FANDISC|Fan\s*Disc)\b/i.exec(value);
  return m?.[1] ? tidySpaces(m[1]) : null;
}

/**
 * Normalize a raw Kobe title for use as a VNDB/EGS search query.
 * Strips used-goods markers, edition/platform labels, age-rating tags,
 * and converts full-width ASCII to half-width so the search engine
 * receives the cleanest possible game title.
 */
export function normalizeTitle(rawTitle: string): string {
  const normalized = normalizePunctuation(rawTitle);
  return stripKnownTrailingDescriptors(stripUsedAndPlatformMarkers(normalized)
    .replace(/\s*Ver\.?\s*[\d.]+\s*/gi, ' '))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export { normalizeTitle as getKobeTitleForSearch };

/**
 * Aggressive title normalization for the "retry without edition" pass.
 * Layers on top of `normalizeTitle` and additionally strips:
 *  - Any trailing token ending in 版 (普及版 / 完全限定生産版 / 抱き枕カバー付限定版 / …),
 *    applied iteratively so chained markers ("豪華限定版 通常版") are both removed.
 *  - Standalone media-format markers (DVD-ROM / Blu-ray / CD-ROM, HDリマスター, …).
 *  - Edition / packaging descriptors at the end (パッケージ, ボックス, BOX, セット, パック,
 *    アペンドパッチ, 拡張パック, アニバーサリー*, プレミアム*, デラックス*, タペストリー付, etc.).
 *  - A trailing `～subtitle～` block.
 * Used only as a retry attempt; the primary match-next path keeps `normalizeTitle`.
 */
export function normalizeTitleAggressive(rawTitle: string): string {
  let t = normalizeTitle(rawTitle);
  t = stripKnownTrailingDescriptors(t);
  // Media-format markers anywhere in the string.
  t = t.replace(/\s*(DVD-?ROM|Blu-?ray|CD-?ROM|HDリマスター|HDサイズエディション)\b/gi, '');
  // Common trailing edition/packaging descriptors.
  t = t.replace(
    /\s+(エディション|パッケージ|ボックス|BOX|セット|パック|アペンドパッチ|拡張パック|追加データ|スキルパック|キャラクターパック|アニバーサリー\S*|スペシャル\S*|プレミアム\S*|デラックス\S*|限定生産|完全生産|抱き枕カバー付|タペストリー付|オナホール同梱|フルセット|普及|破格|廉価)\s*$/gi,
    '',
  );
  // A trailing ～...～ subtitle block.
  t = t.replace(/\s*[～~〜][^～~〜]*[～~〜]\s*$/g, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/**
 * VNDB's search is good, but not magic: Alice Kobe titles often append shop
 * descriptors, media labels, roman subtitles, or fandisc packaging text that
 * makes the exact query miss. Try a small, ordered set of increasingly plain
 * queries, keeping the original first for precise titles.
 */
export function buildKobeTitleSearchQueries(rawTitle: string): string[] {
  const base = normalizeTitle(rawTitle);
  const aggressive = normalizeTitleAggressive(rawTitle);
  const variants: string[] = [base, aggressive];

  for (const value of [base, aggressive]) {
    if (!value) continue;
    variants.push(...withoutDecorativeSubtitle(value));
    variants.push(stripKnownTrailingDescriptors(value));
    const baseFandiscTitle = withoutFandiscMarker(value);
    if (baseFandiscTitle) variants.push(baseFandiscTitle);
    variants.push(tidySpaces(value.replace(/\bFANDISC\b/gi, 'FD')));
    variants.push(tidySpaces(value.replace(/ミニ\s*FD/gi, 'ミニFD')));
    const camel = insertCamelSpacing(value);
    if (camel !== value) variants.push(tidySpaces(camel));
  }

  for (const value of [...variants]) {
    if (!value || value.length > 80) continue;
    const compact = value.replace(/\s+/g, '');
    if (compact !== value && compact.length >= 3) variants.push(compact);
  }

  return uniq(variants.map(tidySpaces))
    .filter((q) => q.length >= 2 && !/^\d$/.test(q))
    .slice(0, MAX_KOBE_QUERY_VARIANTS);
}

function normalizeReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function comparableTitle(value: string | null | undefined): string {
  if (!value) return '';
  return normalizePunctuation(value)
    .toLocaleLowerCase()
    .replace(/fandisc/g, 'fd')
    .replace(/fan\s*disc/g, 'fd')
    .replace(/vol\.\s*0*(\d+)/g, 'vol$1')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function candidateScore(candidate: KobeCandidate, query: string, releaseDate: string | null, index: number): number {
  const title = comparableTitle(candidate.title);
  const alt = comparableTitle(candidate.alttitle);
  const q = comparableTitle(query);
  let score = Math.max(0, 20 - index);

  if (releaseDate && candidate.released === releaseDate) score += 100;
  if (q && title && (title.includes(q) || q.includes(title))) score += 35;
  if (q && alt && (alt.includes(q) || q.includes(alt))) score += 35;

  const vol = /(?:vol|volume)\.?\s*0*(\d{1,2})\b/i.exec(query)?.[1];
  if (vol) {
    const volRe = new RegExp(`(?:vol|volume)?0*${vol}\\b`, 'i');
    if (volRe.test(candidate.title) || (candidate.alttitle && volRe.test(candidate.alttitle))) score += 20;
  }
  if (/\bFD\b|ファンディスク|ミニFD/i.test(query) && /fd|fandisc|fan disc/i.test(`${candidate.title} ${candidate.alttitle ?? ''}`)) {
    score += 15;
  }

  return score;
}

function pickBestCandidate(candidates: KobeCandidate[], query: string, releaseDate: string | null): {
  candidate: KobeCandidate;
  score: number;
} | null {
  let best: { candidate: KobeCandidate; score: number } | null = null;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const score = candidateScore(candidate, query, releaseDate, index);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}

function hasCandidateTextMatch(candidate: KobeCandidate, query: string): boolean {
  const title = comparableTitle(candidate.title);
  const alt = comparableTitle(candidate.alttitle);
  const q = comparableTitle(query);
  return Boolean(q && ((title && (title.includes(q) || q.includes(title))) || (alt && (alt.includes(q) || q.includes(alt)))));
}

function isSafeAutoCandidate(
  candidate: KobeCandidate | null,
  score: number,
  query: string,
  releaseDate: string | null,
): candidate is KobeCandidate {
  if (!candidate) return false;
  const q = comparableTitle(query);
  const exactRelease = Boolean(releaseDate && candidate.released === releaseDate);
  const textMatch = hasCandidateTextMatch(candidate, query);
  if (!textMatch) return false;

  // Short fallback queries are useful for titles like ぎゃるふろ, but unsafe for
  // accidental stems like すくぅ from すくぅ～るメイト２. Require date support.
  if (q.length < 4) return exactRelease;

  return exactRelease || score >= 45;
}

async function searchKobeVndbCandidates(item: KobeStockRow): Promise<{
  top: KobeCandidate | null;
  candidatesJson: string | null;
  query: string | null;
}> {
  const queries = buildKobeTitleSearchQueries(item.title);
  const releaseDate = normalizeReleaseDate(item.release_date);
  if (queries.length === 0) return { top: null, candidatesJson: null, query: null };

  let lastQuery = queries[0] ?? null;
  for (const query of queries) {
    lastQuery = query;
    const vnResult = await searchVn(query, { results: 5 });
    const candidates: KobeCandidate[] = (vnResult.results ?? []).slice(0, 5).map((v) => ({
      id: v.id,
      title: v.title,
      alttitle: v.alttitle,
      released: v.released,
    }));
    if (candidates.length === 0) continue;
    const picked = pickBestCandidate(candidates, query, releaseDate);
    const top = isSafeAutoCandidate(picked?.candidate ?? null, picked?.score ?? 0, query, releaseDate)
      ? picked!.candidate
      : null;
    if (!top) continue;
    return {
      top,
      candidatesJson: JSON.stringify(candidates.slice(0, 3)),
      query,
    };
  }

  return { top: null, candidatesJson: null, query: lastQuery };
}

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
  retryStartedAt?: number,
): Promise<{ processed: number; remaining: number }> {
  const safe = Math.min(100, Math.max(1, Math.floor(batchSize)));
  const items = listKobeUnmatched(safe, retryNone, retryStartedAt);
  for (const item of items) {
    const primaryQuery = buildKobeTitleSearchQueries(item.title)[0] ?? normalizeTitle(item.title);
    if (!primaryQuery) {
      setKobeVnLink(item.code, null, 'none', null, item.title);
      continue;
    }
    const [vndbResult] = await Promise.allSettled([
      searchKobeVndbCandidates(item)
        .then((vnResult) => {
          setKobeVnLink(
            item.code,
            vnResult.top?.id ?? null,
            vnResult.top ? 'auto' : 'none',
            vnResult.candidatesJson,
            vnResult.query ?? primaryQuery,
          );
        }),
      searchEgsByName(primaryQuery)
        .then((r) => { if (r) setKobeEgsLink(item.code, r.id, 'auto'); })
        .catch(() => {}),
    ]);
    if (vndbResult.status === 'rejected') throw vndbResult.reason;
  }
  return {
    processed: items.length,
    remaining: countKobeUnmatchedQueue(retryNone, retryStartedAt),
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
 * stay in the 'none' queue for a later retry or manual link. The returned
 * `remaining` count is scoped to the current run window so the UI can keep
 * moving forward without looping over the same rows after a timeout.
 *
 * @param batchSize  Max number of rows to process this call (clamped 1–500)
 */
export async function matchVndbFromEgsForKobe(
  batchSize: number,
  retryStartedAt?: number,
): Promise<{ processed: number; matched: number; remaining: number }> {
  const safe = Math.min(500, Math.max(1, Math.floor(batchSize)));
  const items = listKobeNoVndbWithEgs(safe, retryStartedAt);
  let matched = 0;
  for (const item of items) {
    let egsId = item.egs_id;
    if (egsId == null) continue;
    // Read the EGS row's curated `vndb` column.
    try {
      const game = await fetchEgsGame(egsId);
      const vndbRaw = game?.raw?.vndb?.trim() ?? '';
      if (game && isVndbVnId(vndbRaw)) {
        setKobeVnLink(item.code, vndbRaw, 'auto', null, item.search_title ?? item.title);
        matched++;
      } else {
        setKobeVnLink(item.code, null, 'none', item.vn_candidates, item.search_title ?? normalizeTitle(item.title));
      }
    } catch {
      // EGS unreachable for this id — leave row as 'none', user can retry.
    }
  }
  return { processed: items.length, matched, remaining: countKobeNoVndbWithEgs(retryStartedAt) };
}

/**
 * Retry VNDB search for "No VNDB result" items using an aggressively cleaned
 * title. The original `matchNextKobeItems` failed because titles like
 *   "ぱらだいすおーしゃん　完全限定生産版"
 *   "いますぐお兄ちゃんに・・・　完全生産限定版"
 *   "ましろ色シンフォニー　サナエディション"
 * carry edition / packaging markers that VNDB doesn't index. We strip those via
 * `normalizeTitleAggressive` and try two queries per item:
 *   1) cleaned title with spaces preserved
 *   2) same title with all whitespace removed (catches "ｔａｎ．タンジェント" vs
 *      "ｔａｎ． －タンジェント－")
 *
 * On hit, `setKobeVnLink` writes the new vn_id and the candidates JSON so the
 * UI's quick-pick chips still work. On miss we refresh the row's last attempt
 * timestamp so the current run continues to the next item instead of retrying
 * the same miss forever.
 *
 * @param batchSize  Max rows processed this call (clamped 1–500). The endpoint
 *                   returns `remaining: 0` so the UI loop exits after one pass.
 */
export async function retryVndbForKobeAggressive(
  batchSize: number,
  retryStartedAt?: number,
): Promise<{ processed: number; matched: number; remaining: number }> {
  const safe = Math.min(500, Math.max(1, Math.floor(batchSize)));
  // listKobeNoVndbResult already returns vn_match_source='none' AND vn_id IS NULL.
  const items = listKobeNoVndbResult(safe, retryStartedAt);
  let matched = 0;
  for (const item of items) {
    try {
      const result = await searchKobeVndbCandidates(item);
      if (result.top) {
        setKobeVnLink(item.code, result.top.id, 'auto', result.candidatesJson, result.query);
        matched++;
      } else {
        setKobeVnLink(item.code, null, 'none', result.candidatesJson, result.query ?? normalizeTitleAggressive(item.title));
      }
    } catch (err) {
      // Stop the batch instead of spinning over the same first rows forever.
      throw err;
    }
  }
  return { processed: items.length, matched, remaining: countKobeNoVndbResult(retryStartedAt) };
}

/**
 * Fresh EGS title search for "No VNDB result" items that also lack an
 * `egs_id`. The original `matchNextKobeItems` already runs `searchEgsByName`,
 * but only once and only with the standard normalization. This entry point
 * lets the user re-run it on demand, optionally with the more aggressive
 * cleanup that strips edition / 版 suffixes and (when used as a second pass)
 * collapses whitespace.
 *
 * On hit, persists `egs_id` with source 'auto'. On miss, refreshes the row's
 * attempt timestamp so this run can continue. The row remains visible for
 * manual linking or later recovery actions.
 *
 * @param batchSize  Max rows processed (clamped 1–500).
 * @param aggressive When true, uses `normalizeTitleAggressive` and additionally
 *                   tries a whitespace-collapsed variant.
 */
export async function searchEgsForKobeNoVndb(
  batchSize: number,
  aggressive: boolean,
  retryStartedAt?: number,
): Promise<{ processed: number; matched: number; remaining: number }> {
  const safe = Math.min(500, Math.max(1, Math.floor(batchSize)));
  const items = listKobeNoVndbNoEgs(safe, retryStartedAt);
  let matched = 0;
  for (const item of items) {
    const primary = aggressive ? normalizeTitleAggressive(item.title) : normalizeTitle(item.title);
    if (!primary) continue;
    const queries: string[] = [primary];
    if (aggressive) {
      const noSpaces = primary.replace(/\s+/g, '');
      if (noSpaces && noSpaces !== primary) queries.push(noSpaces);
    }
    let found = false;
    for (const q of queries) {
      try {
        const r = await searchEgsByName(q);
        if (r) {
          setKobeEgsLink(item.code, r.id, 'auto');
          matched++;
          found = true;
          break;
        }
      } catch (err) {
        // Stop the batch instead of spinning over the same first rows forever.
        throw err;
      }
    }
    if (!found) setKobeVnLink(item.code, null, 'none', item.vn_candidates, item.search_title ?? primary);
  }
  return { processed: items.length, matched, remaining: countKobeNoVndbNoEgs(retryStartedAt) };
}
