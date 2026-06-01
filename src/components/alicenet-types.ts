/**
 * Shared alicenet types — extracted from AliceNetClient.tsx during the
 * U-234 file split. Lives in a sibling `.ts` so both the main client
 * and the extracted sub-components (`AliceNetLinkDialog`,
 * `AliceNetCandidateChips`) can import without cycles.
 */
import type { Locale } from '@/lib/i18n/dictionaries';
import { formatVndbDateString } from '@/lib/locale-number';
import {
  parseNamedIdRows,
  parseVndbCandidateRows,
  type VndbCandidateRow,
} from '@/lib/client-persisted-shape';
import type { AliceNetClientItem, AliceNetClientStats } from '@/lib/alicenet-client-shape';

/** Candidate VNDB row persisted for AliceNet remapping. */
export type AliceNetCandidate = VndbCandidateRow;

/** AliceNet stock row rendered by card and list views. */
export type AliceNetItem = AliceNetClientItem;

/** AliceNet header counters rendered by the browser. */
export type AliceNetStats = AliceNetClientStats;

export interface AliceNetSearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

export type AliceNetFilterTab =
  | 'all' | 'matched' | 'vndb' | 'egs_only' | 'unmatched'
  | 'none_found' | 'collection' | 'wishlist';
export type AliceNetSort =
  | 'title' | 'release_desc' | 'release_asc' | 'price_asc' | 'price_desc'
  | 'match_status' | 'updated_desc';
export type AliceNetGroup = 'none' | 'match' | 'producer' | 'year';
export type AliceNetView = 'cards' | 'list';

export const ALICENET_SORTS: AliceNetSort[] = [
  'match_status', 'release_desc', 'release_asc',
  'price_asc', 'price_desc', 'title', 'updated_desc',
];
export const ALICENET_GROUPS: AliceNetGroup[] = ['none', 'match', 'producer', 'year'];

/**
 * Parse a raw alicenet price string ("¥4,270", "4,270円") to its integer
 * yen value. Returns null when there are no digits or the value is ≤ 0.
 */
export function parseAliceNetPrice(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Canonicalise a JP-shaped date ("2017/12/22", "2017-12-22") to the
 * ISO `YYYY-MM-DD` form used by sort comparisons. Returns '' for null,
 * and passes through unrecognised formats verbatim.
 */
export function comparableAliceNetDate(value: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
  if (!m) return value;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** Locale-format a alicenet date for display. */
export function formatAliceNetDate(value: string | null, locale: Locale): string {
  if (!value) return '';
  const iso = comparableAliceNetDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatVndbDateString(iso, locale);
  const m = /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/.exec(value);
  if (m) {
    const [, y, mo, d] = m;
    const padded = `${y}-${(mo ?? '01').padStart(2, '0')}-${(d ?? '01').padStart(2, '0')}`;
    return formatVndbDateString(padded, locale);
  }
  return value;
}

/** Parse persisted developer rows used by AliceNet cards. */
export function parseAliceNetDevs(json: string | null): { id: string; name: string }[] {
  return parseNamedIdRows(json);
}

/** Parse persisted VNDB candidates used by AliceNet remapping controls. */
export function parseAliceNetCandidates(json: string | null): AliceNetCandidate[] {
  return parseVndbCandidateRows(json);
}

export function alicenetMatchKind(item: AliceNetItem): 'vndb' | 'egs' | 'unresolved' | 'new' {
  if (item.vn_id) return 'vndb';
  if (item.egs_id) return 'egs';
  if (item.vn_match_source === 'none') return 'unresolved';
  return 'new';
}

export function displayAliceNetTitle(item: AliceNetItem): string {
  return item.egs_title || item.title;
}

export function displayAliceNetProducer(item: AliceNetItem): string {
  const dev = parseAliceNetDevs(item.vn_developers)[0]?.name;
  return dev || item.egs_brand || '';
}
