/**
 * URL-state helpers for the `/characters` and `/staff` search pages.
 *
 * Both pages support a "Local" tab (search the locally-cached character
 * / staff joined with collection VNs) and a "VNDB" tab (search VNDB's
 * `POST /character` and `POST /staff` endpoints). Each tab carries
 * filter chips: role, sex (characters), language (staff), and a
 * minimum-spoiler-level toggle. The chips' state lives entirely in the
 * URL so the picker is shareable.
 *
 * The helpers are pure (no DB / no fetch) so unit tests can assert
 * the parser + filter cascade without any runtime setup. The UI
 * wires `parseCharacterSearchParams` to `useSearchParams()`,
 * `parseStaffSearchParams` likewise, and renders the resolved object
 * directly.
 */

export type CharacterSearchTab = 'local' | 'vndb';
export type StaffSearchTab = 'local' | 'vndb';

export type CharacterRole = 'main' | 'primary' | 'side' | 'appears';
export type CharacterSex = 'm' | 'f' | 'b' | 'n';
export type SpoilerLevel = 0 | 1 | 2;

export interface CharacterSearchParams {
  /** Active tab. Defaults to `local` so the page paints instantly. */
  tab: CharacterSearchTab;
  /** Search query (already trimmed). Empty string means "idle". */
  q: string;
  role: CharacterRole | null;
  sex: CharacterSex | null;
  /** Maximum spoiler level shown. Defaults to 0 (no spoilers). */
  spoiler: SpoilerLevel;
  /** Filter by an "appears in" VN id (`v\d+`). */
  vn: string | null;
}

export interface StaffSearchParams {
  tab: StaffSearchTab;
  q: string;
  /** VNDB staff role identifier (`scenario`, `art`, `music`, …). */
  role: string | null;
  /** Two-letter VNDB language code (e.g. `ja`). */
  lang: string | null;
  /** Filter by a credited VN id (`v\d+`). */
  vn: string | null;
}

const CHARACTER_ROLES: readonly CharacterRole[] = ['main', 'primary', 'side', 'appears'];
const CHARACTER_SEXES: readonly CharacterSex[] = ['m', 'f', 'b', 'n'];
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

function parseSpoiler(raw: string | undefined): SpoilerLevel {
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  return 0;
}

export function parseCharacterSearchParams(
  raw: Record<string, string | string[] | undefined>,
): CharacterSearchParams {
  const tab = pickFirst(raw.tab) === 'vndb' ? 'vndb' : 'local';
  const q = (pickFirst(raw.q) ?? '').trim();
  const roleRaw = pickFirst(raw.role) ?? null;
  const role = roleRaw && (CHARACTER_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as CharacterRole)
    : null;
  const sexRaw = pickFirst(raw.sex) ?? null;
  const sex = sexRaw && (CHARACTER_SEXES as readonly string[]).includes(sexRaw)
    ? (sexRaw as CharacterSex)
    : null;
  const spoiler = parseSpoiler(pickFirst(raw.spoiler));
  const vnRaw = pickFirst(raw.vn) ?? null;
  const vn = vnRaw && /^v\d+$/i.test(vnRaw) ? vnRaw.toLowerCase() : null;
  return { tab, q, role, sex, spoiler, vn };
}

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
  const vn = vnRaw && /^v\d+$/i.test(vnRaw) ? vnRaw.toLowerCase() : null;
  return { tab, q, role, lang, vn };
}

/**
 * Translate the parsed character filters into a partial VNDB filter
 * predicate array. Returns an empty array when nothing is filtered.
 * The result is meant to be combined with the search clause via the
 * usual VNDB `and` wrapper at the call site.
 */
export function characterSearchFilters(
  p: Pick<CharacterSearchParams, 'role' | 'sex' | 'vn'>,
): Array<[string, string, unknown]> {
  const out: Array<[string, string, unknown]> = [];
  if (p.role) out.push(['role', '=', p.role]);
  if (p.sex) out.push(['sex', '=', p.sex]);
  if (p.vn) out.push(['vn', '=', ['id', '=', p.vn]]);
  return out;
}

/**
 * Translate parsed staff filters into a partial VNDB filter predicate
 * array. Same shape as `characterSearchFilters`; see comment there.
 */
export function staffSearchFilters(
  p: Pick<StaffSearchParams, 'role' | 'lang' | 'vn'>,
): Array<[string, string, unknown]> {
  const out: Array<[string, string, unknown]> = [];
  if (p.role) out.push(['role', '=', p.role]);
  if (p.lang) out.push(['lang', '=', p.lang]);
  if (p.vn) out.push(['vn', '=', ['id', '=', p.vn]]);
  return out;
}
