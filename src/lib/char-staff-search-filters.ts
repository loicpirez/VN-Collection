import { isVndbVnId } from '@/lib/vn-id-shape';
import { parseWorksScope, type WorksScope } from '@/lib/works-scope';
/**
 * URL-state helpers for the `/staff` search page.
 *
 * The page supports a "Local" tab (search the locally-cached staff joined
 * with collection VNs) and a "VNDB" tab (search VNDB's `POST /staff`
 * endpoint). Filter chips (role, language, VN) live entirely in the URL so
 * the picker is shareable.
 *
 * Helpers are pure (no DB / no fetch) so unit tests can assert the parser
 * cascade without any runtime setup.
 */

export type StaffSearchTab = 'local' | 'vndb';

export type StaffSearchScope = WorksScope;

export type StaffSort = 'name' | 'vn_count';

export interface StaffSearchParams {
  tab: StaffSearchTab;
  q: string;
  /** VNDB staff role identifier (`scenario`, `art`, `music`, …). */
  role: string | null;
  /** Two-letter VNDB language code (e.g. `ja`). */
  lang: string | null;
  /** Filter by a credited VN id (`v\d+`). */
  vn: string | null;
  /**
   * `all` — mix local + VNDB results (default).
   * `collection` — only search local `vn_staff_credit` rows tied to
   *                the operator's active collection.
   * `sold` — only search local credits on archived games.
   */
  scope: StaffSearchScope;
  /** Sort field for the result list. Defaults to `name`. */
  sort: StaffSort;
  /** Reverse the sort direction. */
  reverse: boolean;
}

const STAFF_ROLES = new Set([
  'scenario',
  'chardesign',
  'art',
  'music',
  'songs',
  'director',
  'producer',
  'staff',
  'translator',
  'editor',
  'qa',
]);

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Coerce raw URL search params into a typed `StaffSearchParams`. Pure: every
 * field is whitelisted / format-checked so malformed query strings cleanly
 * fall back to defaults rather than propagating bad input downstream.
 */
export function parseStaffSearchParams(
  raw: Record<string, string | string[] | undefined>,
): StaffSearchParams {
  const tab = pickFirst(raw.tab) === 'vndb' ? 'vndb' : 'local';
  const q = (pickFirst(raw.q) ?? '').trim();
  const roleRaw = pickFirst(raw.role) ?? null;
  const role = roleRaw && STAFF_ROLES.has(roleRaw) ? roleRaw : null;
  const langRaw = pickFirst(raw.lang) ?? null;
  // VNDB accepts arbitrary language codes (`ja`, `en`, `zh-Hans`); a
  // strict whitelist would lag behind VNDB. Accept lowercase 2-7
  // characters with optional `-Variant` suffix.
  const lang = langRaw && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(langRaw) ? langRaw : null;
  const vnRaw = pickFirst(raw.vn) ?? null;
  const vn = vnRaw && isVndbVnId(vnRaw) ? vnRaw.toLowerCase() : null;
  const scope = parseWorksScope(raw.scope);
  const sort: StaffSort = pickFirst(raw.sort) === 'vn_count' ? 'vn_count' : 'name';
  const reverse = pickFirst(raw.reverse) === '1';
  return { tab, q, role, lang, vn, scope, sort, reverse };
}
