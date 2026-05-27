/**
 * Shared kobe types — extracted from AliceNetKobeClient.tsx during the
 * U-234 file split. Lives in a sibling `.ts` so both the main client
 * and the extracted sub-components (`KobeLinkDialog`,
 * `KobeCandidateChips`) can import without cycles.
 */
import type { Locale } from '@/lib/i18n/dictionaries';
import { formatVndbDateString } from '@/lib/locale-number';

export interface KobeCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

export interface KobeItem {
  code: string;
  title: string;
  jan: string | null;
  release_date: string | null;
  list_price: string | null;
  sale_price: string | null;
  vn_id: string | null;
  vn_match_source: 'auto' | 'manual' | 'none' | null;
  vn_candidates: string | null;
  search_title: string | null;
  egs_id: number | null;
  egs_match_source: 'auto' | 'manual' | null;
  egs_title: string | null;
  egs_brand: string | null;
  egs_release_date: string | null;
  egs_image_url: string | null;
  egs_vndb_raw: string | null;
  in_collection: number;
  in_wishlist: number;
  last_matched_at: number | null;
  fetched_at: number;
  updated_at: number;
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_image_sexual: number | null;
  vn_developers: string | null;
}

export interface KobeStats {
  total: number;
  matched: number;
  vndb_matched: number;
  egs_only: number;
  unmatched: number;
  unprocessed: number;
  none_found: number;
  in_collection: number;
  in_wishlist: number;
}

export interface KobeSearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

export type KobeFilterTab =
  | 'all' | 'matched' | 'vndb' | 'egs_only' | 'unmatched'
  | 'none_found' | 'collection' | 'wishlist';
export type KobeSort =
  | 'title' | 'release_desc' | 'release_asc' | 'price_asc' | 'price_desc'
  | 'match_status' | 'updated_desc';
export type KobeGroup = 'none' | 'match' | 'producer' | 'year';
export type KobeView = 'cards' | 'list';

export const KOBE_SORTS: KobeSort[] = [
  'match_status', 'release_desc', 'release_asc',
  'price_asc', 'price_desc', 'title', 'updated_desc',
];
export const KOBE_GROUPS: KobeGroup[] = ['none', 'match', 'producer', 'year'];

/**
 * Parse a raw kobe price string ("¥4,270", "4,270円") to its integer
 * yen value. Returns null when there are no digits or the value is ≤ 0.
 */
export function parseKobePrice(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Canonicalise a JP-shaped date ("2017/12/22", "2017-12-22") to the
 * ISO `YYYY-MM-DD` form used by sort comparisons. Returns '' for null,
 * and passes through unrecognised formats verbatim.
 */
export function comparableKobeDate(value: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
  if (!m) return value;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * Audit U-238: locale-format a kobe date for display.
 */
export function formatKobeDate(value: string | null, locale: Locale): string {
  if (!value) return '';
  const iso = comparableKobeDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatVndbDateString(iso, locale);
  const m = /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/.exec(value);
  if (m) {
    const [, y, mo, d] = m;
    const padded = `${y}-${(mo ?? '01').padStart(2, '0')}-${(d ?? '01').padStart(2, '0')}`;
    return formatVndbDateString(padded, locale);
  }
  return value;
}

/**
 * Audit U-239 / U-240: locale-format a kobe price for display via
 * Intl.NumberFormat. JPY currency (single-market app — I-023 OK).
 */
export function formatKobePrice(value: string | null, locale: Locale): string {
  if (!value) return '';
  const n = parseKobePrice(value);
  if (n == null) return value;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseKobeDevs(json: string | null): { id: string; name: string }[] {
  if (!json) return [];
  try { return JSON.parse(json) as { id: string; name: string }[]; } catch { return []; }
}

export function kobeMatchKind(item: KobeItem): 'vndb' | 'egs' | 'unresolved' | 'new' {
  if (item.vn_id) return 'vndb';
  if (item.egs_id) return 'egs';
  if (item.vn_match_source === 'none') return 'unresolved';
  return 'new';
}

export function displayKobeTitle(item: KobeItem): string {
  return item.egs_title || item.title;
}

export function displayKobeProducer(item: KobeItem): string {
  const dev = parseKobeDevs(item.vn_developers)[0]?.name;
  return dev || item.egs_brand || '';
}
