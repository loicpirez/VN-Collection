import 'server-only';
import { searchVn } from './vndb';
import { fetchEgsGame, searchEgsByName, searchEgsCandidates, type EgsCandidate, type EgsGame } from './erogamescape';
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
const MAX_KOBE_QUERY_VARIANTS = 64;
const MAX_KOBE_VNDB_AUTO_QUERIES = 24;
const MAX_KOBE_EGS_AUTO_QUERIES = 16;

export interface KobeCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  aliases?: string[];
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
    .replace(/([(「『])\s+/g, '$1')
    .replace(/\s+([)」』])/g, '$1')
    .trim();
}

function normalizePunctuation(rawTitle: string): string {
  return rawTitle
    .normalize('NFKC')
    .replace(/&times;/g, '×')
    .replace(/&rarr;/g, '→')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
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
      .replace(/(?:初回限|初回生産限定|完全限定生産|完全生産限定|豪華限定|初回|通常|限定|豪華|普及|廉価|復刻|再販|アウトレット)$/u, '')
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
    .replace(/(\d)(Plus|After|Ver|Vol|Edition)\b/gi, '$1 $2')
    .replace(/(3D2?|CM3D2|COM3D2)(CP|キャラクターパック|スキルパック|ビジュアル|性格)/gi, '$1 $2')
    .replace(/(Vol\.?)(\d+)/gi, '$1 $2')
    .replace(/(chapter\.?)(\d+)/gi, '$1 $2')
    .replace(/\b([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
}

function punctuationVariants(value: string): string[] {
  const out: string[] = [];
  if (value.includes('~')) out.push(value.replace(/~/g, '～'));
  if (value.includes('～')) out.push(value.replace(/～/g, '~'));
  if (value.includes('-')) out.push(value.replace(/-/g, '－'));
  if (value.includes('－')) out.push(value.replace(/－/g, '-'));
  if (value.includes("'")) out.push(value.replace(/'/g, '’'));
  if (value.includes('...')) out.push(value.replace(/\.\.\./g, '…'));
  if (value.includes('…')) out.push(value.replace(/…/g, '...'));
  return out;
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

function subtitleOnlyVariants(value: string): string[] {
  const out: string[] = [];
  const t = tidySpaces(value);
  const patterns = [
    /[-－]\s*([^-－~～〜]{4,})\s*[-－]?$/u,
    /[~～〜]\s*([^~～〜]{4,})\s*[~～〜]?$/u,
    /[（(]\s*([^)）]{4,})\s*[)）]$/u,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m?.[1]) out.push(tidySpaces(m[1]));
  }
  return out.filter((v) => v && v !== t);
}

function tailSegmentVariants(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];
  const normalized = t.replace(/[+＋&＆／/、,，。・:：~～〜\-－()（）!！?？]/g, ' ');
  const parts = normalized.split(/\s+/).map(tidySpaces).filter(Boolean);
  const tailParts = parts.length >= 3 ? parts.slice(-2) : parts.slice(-1);
  for (const part of tailParts) {
    if (part.length >= 3 && part !== t) out.push(part);
  }
  return out;
}

function withoutFandiscMarker(value: string): string | null {
  const m = /^(.{2,}?)\s+(?:ミニ\s*)?(?:FD|ファンディスク|FANDISC|Fan\s*Disc)\b/i.exec(value);
  return m?.[1] ? tidySpaces(m[1]) : null;
}

function withoutCollectionPrefix(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];
  const patterns = [
    /^(?:ヌキコレ|ヌキレコ)\s*\d+\s*(.+)$/u,
    /^M\s*P\s*C\s*vol\.?\s*\d+\s*(.+)$/iu,
    /^BS\s+(.+)$/iu,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m?.[1]) out.push(tidySpaces(m[1]));
  }
  return out;
}

function romanNumeralTitleVariants(value: string): string[] {
  const t = tidySpaces(value);
  const numerals: Record<string, string> = {
    '1': 'I',
    '2': 'II',
    '3': 'III',
    '4': 'IV',
    '5': 'V',
  };
  const out: string[] = [];
  for (const [digit, roman] of Object.entries(numerals)) {
    out.push(t.replace(new RegExp(`D\\.C\\.${digit}`, 'gi'), `D.C.${roman}`));
    out.push(t.replace(new RegExp(`ダ・カーポ${digit}`, 'g'), `ダ・カーポ${roman}`));
    out.push(t
      .replace(new RegExp(`D\\.C\\.${digit}`, 'gi'), `D.C.${roman}`)
      .replace(new RegExp(`ダ・カーポ${digit}`, 'g'), `ダ・カーポ${roman}`));
  }
  out.push(t.replace(/支配の教壇2/g, '支配の教壇II'));
  return out.filter((v) => v && v !== t);
}

function knownTitleDialectVariants(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];
  const replacements: Array<[RegExp, string]> = [
    [/イチャ2/g, 'イチャ×2'],
    [/ドキ2/g, 'ドキドキ'],
    [/キャロットヘようこそ/g, 'キャロットへようこそ'],
    [/神聖昴燐/g, '神聖昂燐'],
    [/悪堕ち/g, '悪堕'],
    [/止まらない/g, 'とまらない'],
    [/聞かせれた/g, '聞かされた'],
    [/サクバス/g, 'サキュバス'],
    [/Lagunalork/gi, 'Lagnalock'],
  ];
  for (const [from, to] of replacements) {
    const next = tidySpaces(t.replace(from, to));
    if (next !== t) out.push(next);
  }

  if (/花鐘カナデグラム/i.test(t)) {
    const chapter = /花鐘カナデグラム\s*(?:chapter\.?)?\s*(\d+)\s*(.*)$/iu.exec(t.replace(/\s+/g, ' '));
    if (chapter?.[1]) out.push(tidySpaces(`花鐘カナデ＊グラム Chapter:${chapter[1]} ${chapter[2] ?? ''}`));
  }

  if (/メイキングラヴァーズ|メイキングラバーズ/i.test(t)) {
    out.push(tidySpaces(t.replace(/メイキングラヴァーズ|メイキングラバーズ/gi, 'Making Lovers')));
    out.push(tidySpaces(t.replace(/メイキングラヴァーズ|メイキングラバーズ/gi, 'Making * Lovers')));
  }

  if (/Amenity'?s\s*Life\s*FD/i.test(insertCamelSpacing(t))) {
    out.push(tidySpaces(insertCamelSpacing(t).replace(/\bFD\b/gi, 'MiniFanDisc')));
  }

  if (/White\s*Angel\s*Fan\s*Disc/i.test(insertCamelSpacing(t))) {
    const tail = insertCamelSpacing(t).replace(/^.*?White\s*Angel\s*Fan\s*Disc/i, '');
    if (tail.trim()) out.push(tidySpaces(tail));
  }

  if (/Piaキャロット/i.test(t) && /G\.P\./i.test(t)) {
    out.push('PiaキャロットへようこそG.P.');
    out.push('Pia Carrot G.P.');
  }

  if (/A\.G\.2\.D\.C\./i.test(t)) out.push(tidySpaces(t.replace(/A\.G\.2\.D\.C\./gi, 'A.G.II.D.C.')));
  if (/LOWな妹/i.test(t)) out.push(tidySpaces(t.replace(/LOWな妹に.*$/i, 'LOWな妹')));
  if (/すりーえす/i.test(t) || /ＳＳＳ|SSS/.test(t)) out.push('SSS Three S');
  if (/黒山羊\s*くろやぎ/u.test(t)) out.push('黒山羊');
  if (/催淫キーワード/u.test(t)) out.push('Saiin Haramase Keyword');
  if (/ドSお姉さんは好きですか/u.test(t)) out.push(tidySpaces(t.replace(/ドSお姉さんは好きですか/gu, 'ドSなお姉さんは好きですか')));
  if (/ガンマディメンジョン/u.test(t)) out.push(tidySpaces(t.replace(/ガンマディメンジョン/gu, 'GAMMA DIMENSION')));
  if (/戦国恋姫ブレイブ壱/u.test(t)) {
    out.push(tidySpaces(t.replace(/戦国恋姫ブレイブ壱/gu, '戦国†恋姫BRAVE壱')));
    out.push(tidySpaces(t.replace(/戦国恋姫ブレイブ壱/gu, '戦国恋姫 BRAVE 壱')));
  }

  return out.filter((v) => v && v !== t);
}

function splitPackVariants(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];
  const compact = t.replace(/\s+/g, '');

  const numberedPack = /^(.+?)(?:1|１)[+＋&＆・／\/](?:2|２)(?:パック|Pack|Collection)?$/iu.exec(compact);
  if (numberedPack?.[1]) {
    out.push(`${numberedPack[1]}1`);
    out.push(`${numberedPack[1]}2`);
  }

  for (const sep of ['+', '＋', '&', '＆']) {
    if (!t.includes(sep)) continue;
    for (const part of t.split(sep)) {
      const cleaned = tidySpaces(part);
      if (cleaned.length >= 4) out.push(cleaned);
    }
  }

  return out;
}

function leadingSegmentVariants(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];
  const terms = t.split(/\s+/).filter(Boolean);

  if (terms.length > 1) {
    for (let n = 1; n <= Math.min(4, terms.length - 1); n++) {
      const candidate = tidySpaces(terms.slice(0, n).join(' '));
      if (candidate.length >= 3) out.push(candidate);
    }
  }

  const firstPunct = t.split(/[－\-:：／/・,，、。!！?？]/u)[0];
  if (firstPunct && firstPunct.length >= 3 && firstPunct !== t) out.push(tidySpaces(firstPunct));

  return out;
}

function progressiveTrimVariants(value: string): string[] {
  const t = tidySpaces(value);
  const out: string[] = [];

  const separatorTrim = [
    /^(.+?)(?:\s|　)*(?:初回|通常|豪華|限定|普及|廉価|復刻|再販|再発売|パッケージ|抱き枕|タペストリー|ラフアート|特典|通販|DVD|CD|BOX|セット|パック|プレミアム|スタンダード|Standard|Limited|Edition)/iu,
    /^(.+?)(?:\s|　)*(?:完全|フル|リマスター|エンハンスド|リリース記念|アニバーサリー)/u,
  ];
  for (const re of separatorTrim) {
    const m = re.exec(t);
    if (m?.[1] && m[1].length >= 4) out.push(tidySpaces(m[1]));
  }

  // Last resort for truncated shop titles: trim one visible character at a
  // time, but keep these late in the query list so exact/title-token variants
  // win first. Auto-accept still requires text/date corroboration.
  const compact = t.replace(/\s+/g, '');
  if (hasJapanese(compact) && compact.length >= 8) {
    for (let len = Math.min(24, compact.length - 1); len >= Math.max(5, compact.length - 10); len--) {
      out.push(compact.slice(0, len));
    }
  }

  return out;
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
    variants.push(...punctuationVariants(value));
    variants.push(...withoutDecorativeSubtitle(value));
    variants.push(...subtitleOnlyVariants(value));
    variants.push(...withoutCollectionPrefix(value));
    variants.push(...splitPackVariants(value));
    variants.push(...romanNumeralTitleVariants(value));
    variants.push(...knownTitleDialectVariants(value));
    variants.push(stripKnownTrailingDescriptors(value));
    variants.push(...leadingSegmentVariants(value));
    variants.push(...tailSegmentVariants(value));
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
    variants.push(...punctuationVariants(value));
    variants.push(...progressiveTrimVariants(value));
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

function releaseDayDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const at = Date.parse(`${a}T00:00:00Z`);
  const bt = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(at) || !Number.isFinite(bt)) return null;
  return Math.abs(at - bt) / 86_400_000;
}

function comparableTitle(value: string | null | undefined): string {
  if (!value) return '';
  return normalizePunctuation(value)
    .toLocaleLowerCase()
    .replace(/fandisc/g, 'fd')
    .replace(/fan\s*disc/g, 'fd')
    .replace(/d\.?\s*c\.?\s*iii/g, 'dc3')
    .replace(/d\.?\s*c\.?\s*ii/g, 'dc2')
    .replace(/d\.?\s*c\.?\s*v/g, 'dc5')
    .replace(/支配の教壇ii/g, '支配の教壇2')
    .replace(/vol\.\s*0*(\d+)/g, 'vol$1')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function candidateTextValues(candidate: KobeCandidate): string[] {
  return [
    candidate.title,
    candidate.alttitle,
    ...(candidate.aliases ?? []),
  ].filter((value): value is string => Boolean(value));
}

function candidateScore(candidate: KobeCandidate, query: string, releaseDate: string | null, index: number): number {
  const texts = candidateTextValues(candidate).map(comparableTitle).filter(Boolean);
  const q = comparableTitle(query);
  let score = Math.max(0, 20 - index);

  if (releaseDate && candidate.released === releaseDate) score += 100;
  if (q && texts.some((text) => text === q)) score += 55;
  if (q && texts.some((text) => text.includes(q) || q.includes(text))) score += 35;

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
  const texts = candidateTextValues(candidate).map(comparableTitle).filter(Boolean);
  const q = comparableTitle(query);
  return Boolean(q && texts.some((text) => text.includes(q) || q.includes(text)));
}

function isSafeAutoCandidate(
  candidate: KobeCandidate | null,
  score: number,
  query: string,
  releaseDate: string | null,
  primaryQuery: string,
): candidate is KobeCandidate {
  if (!candidate) return false;
  const q = comparableTitle(query);
  const primary = comparableTitle(primaryQuery);
  const exactRelease = Boolean(releaseDate && candidate.released === releaseDate);
  const closeRelease = releaseDayDistance(releaseDate, candidate.released) != null
    && releaseDayDistance(releaseDate, candidate.released)! <= 370;
  const textMatch = hasCandidateTextMatch(candidate, query);
  const exactTitle = candidateTextValues(candidate).map(comparableTitle).some((text) => text === q);
  if (!textMatch) return false;
  if (exactRelease) return true;

  // Short fallback queries are useful for titles like ぎゃるふろ, but unsafe for
  // accidental stems like すくぅ from すくぅ～るメイト２. Require date support.
  if (q.length < 6) {
    return closeRelease && (exactTitle || score >= 40);
  }

  // Progressive trim queries are intentionally late fallbacks, but they can be
  // too broad: "ティンクル" should not auto-link a 2023 item to Twinkle Crusaders.
  // If the query covers less than half of the cleaned shop title, require
  // release-date support before accepting it.
  const coverage = primary ? q.length / primary.length : 1;
  if (coverage < 0.5 && !closeRelease) return false;

  return closeRelease || exactTitle || score >= 55;
}

function egsMeta(game: EgsGame | null | undefined): Parameters<typeof setKobeEgsLink>[3] | undefined {
  if (!game) return undefined;
  return {
    title: game.gamename,
    brand: game.brand_name,
    releaseDate: game.sellday,
    imageUrl: game.image_url,
    vndbRaw: game.raw?.vndb ?? null,
  };
}

function egsCandidateScore(candidate: EgsCandidate, query: string, releaseDate: string | null, index: number): number {
  const title = comparableTitle(candidate.gamename);
  const furigana = comparableTitle(candidate.gamename_furigana);
  const q = comparableTitle(query);
  let score = Math.max(0, 30 - index);
  if (releaseDate && candidate.sellday === releaseDate) score += 120;
  if (q && title && (title.includes(q) || q.includes(title))) score += 45;
  if (q && furigana && (furigana.includes(q) || q.includes(furigana))) score += 45;
  if (q && q.length >= 5 && title.startsWith(q.slice(0, Math.min(q.length, 12)))) score += 15;
  if (q && q.length >= 5 && furigana.startsWith(q.slice(0, Math.min(q.length, 12)))) score += 15;
  if (candidate.count != null) score += Math.min(20, Math.log10(candidate.count + 1) * 8);
  return score;
}

function isSafeEgsCandidate(candidate: EgsCandidate | null, score: number, query: string, releaseDate: string | null): candidate is EgsCandidate {
  if (!candidate) return false;
  const q = comparableTitle(query);
  const title = comparableTitle(candidate.gamename);
  const furigana = comparableTitle(candidate.gamename_furigana);
  if (!q || !title) return false;
  const textMatch = title.includes(q)
    || q.includes(title)
    || Boolean(furigana && (furigana.includes(q) || q.includes(furigana)))
    || (q.length >= 6 && title.startsWith(q.slice(0, 6)))
    || Boolean(q.length >= 6 && furigana && furigana.startsWith(q.slice(0, 6)));
  const exactRelease = Boolean(releaseDate && candidate.sellday === releaseDate);
  // Older cached EGS candidate rows did not include furigana. If the row came
  // back from an EGS title/furigana search and the release date is exact, keep
  // it eligible instead of rejecting valid kana -> romanized-title matches.
  const exactTitle = title === q || furigana === q;
  if (!textMatch && !(exactRelease && q.length >= 4)) return false;
  if (q.length < 4) return exactRelease || exactTitle;
  return exactRelease || exactTitle || score >= 60;
}

async function searchKobeEgsCandidate(item: KobeStockRow): Promise<{ game: EgsGame | null; query: string | null }> {
  const queries = buildKobeTitleSearchQueries(item.title).slice(0, MAX_KOBE_EGS_AUTO_QUERIES);
  const releaseDate = normalizeReleaseDate(item.release_date);
  let lastQuery = queries[0] ?? null;

  for (const query of queries) {
    lastQuery = query;
    let candidates: EgsCandidate[];
    try {
      candidates = await searchEgsCandidates(query, 8);
    } catch {
      return { game: null, query };
    }
    if (candidates.length === 0) continue;

    let best: { candidate: EgsCandidate; score: number } | null = null;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]!;
      const score = egsCandidateScore(candidate, query, releaseDate, index);
      if (!best || score > best.score) best = { candidate, score };
    }

    if (!isSafeEgsCandidate(best?.candidate ?? null, best?.score ?? 0, query, releaseDate)) continue;
    let game: EgsGame | null = null;
    try {
      game = await fetchEgsGame(best!.candidate.id);
    } catch {
      return { game: null, query };
    }
    if (game) return { game, query };
  }

  return { game: null, query: lastQuery };
}

async function searchKobeVndbCandidates(item: KobeStockRow): Promise<{
  top: KobeCandidate | null;
  candidatesJson: string | null;
  query: string | null;
}> {
  const queries = buildKobeTitleSearchQueries(item.title).slice(0, MAX_KOBE_VNDB_AUTO_QUERIES);
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
      aliases: [
        ...(v.aliases ?? []),
        ...((v.titles ?? []).flatMap((title) => [title.title, title.latin]).filter((title): title is string => Boolean(title))),
      ],
      released: v.released,
    }));
    if (candidates.length === 0) continue;
    const picked = pickBestCandidate(candidates, query, releaseDate);
    const top = isSafeAutoCandidate(picked?.candidate ?? null, picked?.score ?? 0, query, releaseDate, queries[0] ?? query)
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
 *   - Fresh rows: VNDB and EGS run concurrently, then both caches make repeats cheap.
 *   - Retry rows: VNDB is tried first with a bounded list of strong title variants;
 *     EGS is a fast fallback so a slow remote SQL form cannot freeze the whole run.
 *   - VNDB: handled by the shared throttle queue (≤ 1 req/s); no extra sleep needed.
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
): Promise<{ processed: number; matched: number; remaining: number }> {
  const safe = Math.min(100, Math.max(1, Math.floor(batchSize)));
  const items = listKobeUnmatched(safe, retryNone, retryStartedAt);
  let matched = 0;
  for (const item of items) {
    const primaryQuery = buildKobeTitleSearchQueries(item.title)[0] ?? normalizeTitle(item.title);
    if (!primaryQuery) {
      setKobeVnLink(item.code, null, 'none', null, item.title);
      continue;
    }
    if (retryNone) {
      const vnResult = await searchKobeVndbCandidates(item);
      if (vnResult.top) {
        setKobeVnLink(
          item.code,
          vnResult.top.id,
          'auto',
          vnResult.candidatesJson,
          vnResult.query ?? primaryQuery,
        );
        matched++;
        continue;
      }

      const egsResult = await searchKobeEgsCandidate(item);
      if (egsResult.game) {
        setKobeEgsLink(item.code, egsResult.game.id, 'auto', egsMeta(egsResult.game));
        matched++;
        const vndbRaw = egsResult.game.raw?.vndb?.trim() ?? '';
        if (isVndbVnId(vndbRaw)) {
          setKobeVnLink(item.code, vndbRaw, 'auto', null, egsResult.query ?? primaryQuery);
        } else {
          setKobeVnLink(item.code, null, 'none', vnResult.candidatesJson, vnResult.query ?? egsResult.query ?? primaryQuery);
        }
        continue;
      }
      setKobeVnLink(item.code, null, 'none', vnResult.candidatesJson, vnResult.query ?? egsResult.query ?? primaryQuery);
      continue;
    }
    let itemMatched = false;
    const [vndbResult, egsResult] = await Promise.allSettled([
      searchKobeVndbCandidates(item)
        .then((vnResult) => {
          if (vnResult.top) itemMatched = true;
          setKobeVnLink(
            item.code,
            vnResult.top?.id ?? null,
            vnResult.top ? 'auto' : 'none',
            vnResult.candidatesJson,
            vnResult.query ?? primaryQuery,
          );
        }),
      searchKobeEgsCandidate(item)
        .then((r) => {
          if (r.game) {
            itemMatched = true;
            setKobeEgsLink(item.code, r.game.id, 'auto', egsMeta(r.game));
          }
        })
        .catch(() => {}),
    ]);
    if (vndbResult.status === 'rejected') throw vndbResult.reason;
    if (egsResult.status === 'rejected') throw egsResult.reason;
    if (itemMatched) matched++;
  }
  return {
    processed: items.length,
    matched,
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
      if (game) setKobeEgsLink(item.code, egsId, item.egs_match_source ?? 'auto', egsMeta(game));
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
    const queries = aggressive ? [] : [primary];
    let found = false;
    try {
      if (aggressive) {
        const r = await searchKobeEgsCandidate(item);
        if (r.game) {
          setKobeEgsLink(item.code, r.game.id, 'auto', egsMeta(r.game));
          matched++;
          found = true;
        }
      }
    } catch (err) {
      // Stop the batch instead of spinning over the same first rows forever.
      throw err;
    }
    for (const q of queries) {
      try {
        const r = await searchEgsByName(q);
        if (r) {
          setKobeEgsLink(item.code, r.id, 'auto', egsMeta(r));
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
