/**
 * Pure helpers powering the `/characters` browsing experience.
 *
 * The page exposes filter chips (sex, role, blood type, seiyuu
 * language, has-voice, has-image), sort options (name, height, age,
 * birthday month) and a group-by selector (blood type, birthday
 * month, sex, role). Every chip lives in the URL so the page is
 * shareable.
 *
 * Kept dependency-free (no React / no `server-only`) so the unit
 * tests can hit the filter + sort cascade without any runtime
 * setup. The `/characters` page wires these helpers to
 * `useSearchParams()` and renders the resolved struct directly.
 */

/**
 * Minimal structural subset of `VndbCharacter` needed by the browse
 * helpers. The two `VndbCharacter` declarations in the repo
 * (`lib/vndb.ts` and `lib/vndb-types.ts`) diverge on nested optional
 * fields; this local alias lets the helpers accept either without
 * a casting hop.
 */
export interface BrowsableCharacter {
  id: string;
  name: string;
  original: string | null;
  image: { url: string; sexual?: number } | null;
  blood_type: string | null;
  height: number | null;
  age: number | null;
  birthday: [number, number] | null;
  sex: [string | null, string | null] | null;
  vns?: ReadonlyArray<{ role: 'main' | 'primary' | 'side' | 'appears'; id?: string; spoiler?: number }>;
}
type VndbCharacter = BrowsableCharacter;

export type CharacterRole = 'main' | 'primary' | 'side' | 'appears';
export type CharacterSex = 'm' | 'f' | 'b' | 'n';
export type BloodType = 'a' | 'b' | 'ab' | 'o';
export type CharacterTab = 'local' | 'vndb' | 'combined';
export type CharacterSort = 'name' | 'height' | 'age' | 'birthday';
export type CharacterGroupBy = '' | 'blood' | 'birthMonth' | 'sex' | 'role';

const CHARACTER_ROLES: readonly CharacterRole[] = ['main', 'primary', 'side', 'appears'];
const CHARACTER_SEXES: readonly CharacterSex[] = ['m', 'f', 'b', 'n'];
const BLOOD_TYPES: readonly BloodType[] = ['a', 'b', 'ab', 'o'];
const TABS: readonly CharacterTab[] = ['local', 'vndb', 'combined'];
const SORTS: readonly CharacterSort[] = ['name', 'height', 'age', 'birthday'];
const GROUPS: readonly CharacterGroupBy[] = ['', 'blood', 'birthMonth', 'sex', 'role'];

export interface CharacterBrowseParams {
  tab: CharacterTab;
  q: string;
  sex: CharacterSex | null;
  role: CharacterRole | null;
  /**
   * Blood-type chip. The URL accepts BOTH `?blood=` (legacy) and
   * `?bloodType=` (canonical, matches the visible label on
   * `/character/[id]` so the metadata link round-trips). The
   * parser normalises either alias into this field.
   */
  blood: BloodType | null;
  /** Two-letter VNDB language code for the seiyuu (e.g. `ja`). */
  vaLang: string | null;
  /** `true` keeps characters with at least one voice credit. */
  hasVoice: boolean | null;
  /** `true` keeps characters with an image. */
  hasImage: boolean | null;
  /**
   * 1..12 — keep characters born in the given month. The
   * birthday-month metadata field on `/character/[id]` links to
   * `?birthMonth=<m>` so users can pivot from "this character"
   * to "everyone born in month m". `null` disables the filter.
   */
  birthMonth: number | null;
  sort: CharacterSort;
  /** Reverse-sort flag. Defaults to false (ascending). */
  reverse: boolean;
  groupBy: CharacterGroupBy;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBool(raw: string | undefined): boolean | null {
  if (raw === '1' || raw === 'yes' || raw === 'true') return true;
  if (raw === '0' || raw === 'no' || raw === 'false') return false;
  return null;
}

export function parseCharacterBrowseParams(
  raw: Record<string, string | string[] | undefined>,
): CharacterBrowseParams {
  const tabRaw = pickFirst(raw.tab);
  const tab = (TABS as readonly string[]).includes(tabRaw ?? '')
    ? (tabRaw as CharacterTab)
    : 'local';
  const q = (pickFirst(raw.q) ?? '').trim();
  const sexRaw = pickFirst(raw.sex) ?? null;
  const sex = sexRaw && (CHARACTER_SEXES as readonly string[]).includes(sexRaw)
    ? (sexRaw as CharacterSex)
    : null;
  const roleRaw = pickFirst(raw.role) ?? null;
  const role = roleRaw && (CHARACTER_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as CharacterRole)
    : null;
  // Accept both `?blood=` (legacy) and `?bloodType=` (canonical,
  // matches the on-character metadata label). The canonical form
  // wins when both are present so the character-detail link is
  // unambiguous.
  const bloodRaw = (pickFirst(raw.bloodType) ?? pickFirst(raw.blood))?.toLowerCase() ?? null;
  const blood = bloodRaw && (BLOOD_TYPES as readonly string[]).includes(bloodRaw)
    ? (bloodRaw as BloodType)
    : null;
  const birthMonthRaw = pickFirst(raw.birthMonth);
  const birthMonthNum = birthMonthRaw != null ? Number.parseInt(birthMonthRaw, 10) : NaN;
  const birthMonth =
    Number.isFinite(birthMonthNum) && birthMonthNum >= 1 && birthMonthNum <= 12
      ? birthMonthNum
      : null;
  const vaLangRaw = pickFirst(raw.vaLang) ?? null;
  const vaLang = vaLangRaw && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(vaLangRaw) ? vaLangRaw : null;
  const hasVoice = parseBool(pickFirst(raw.hasVoice));
  const hasImage = parseBool(pickFirst(raw.hasImage));
  const sortRaw = pickFirst(raw.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as CharacterSort)
    : 'name';
  const reverse = pickFirst(raw.reverse) === '1';
  const groupRaw = pickFirst(raw.groupBy) ?? '';
  const groupBy = (GROUPS as readonly string[]).includes(groupRaw)
    ? (groupRaw as CharacterGroupBy)
    : '';
  return {
    tab,
    q,
    sex,
    role,
    blood,
    vaLang,
    hasVoice,
    hasImage,
    birthMonth,
    sort,
    reverse,
    groupBy,
  };
}

/** Apply the chip filters to an in-memory character list. */
export function filterCharacters(
  list: readonly VndbCharacter[],
  params: CharacterBrowseParams,
): VndbCharacter[] {
  return list.filter((c) => {
    if (params.sex && c.sex?.[0] !== params.sex) return false;
    if (params.role) {
      const hit = c.vns?.some((v) => v.role === params.role);
      if (!hit) return false;
    }
    if (params.blood) {
      if ((c.blood_type ?? '').toLowerCase() !== params.blood) return false;
    }
    if (params.birthMonth != null) {
      if (birthdayMonth(c) !== params.birthMonth) return false;
    }
    if (params.hasImage === true && !c.image?.url) return false;
    if (params.hasImage === false && c.image?.url) return false;
    return true;
  });
}

/** Comparator-based sort, stable on ties via the character id. */
export function sortCharacters(
  list: readonly VndbCharacter[],
  params: Pick<CharacterBrowseParams, 'sort' | 'reverse'>,
): VndbCharacter[] {
  const copy = [...list];
  copy.sort((a, b) => {
    let cmp = 0;
    switch (params.sort) {
      case 'name':
        cmp = (a.name ?? '').localeCompare(b.name ?? '');
        break;
      case 'height':
        cmp = nullableNumberCompare(a.height, b.height);
        break;
      case 'age':
        cmp = nullableNumberCompare(a.age, b.age);
        break;
      case 'birthday':
        cmp = nullableNumberCompare(birthdayMonth(a), birthdayMonth(b));
        break;
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return params.reverse ? -cmp : cmp;
  });
  return copy;
}

function nullableNumberCompare(a: number | null | undefined, b: number | null | undefined): number {
  // Nulls sort last regardless of direction so empties stay grouped.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function birthdayMonth(c: VndbCharacter): number | null {
  return c.birthday?.[0] ?? null;
}

/** Group a filtered+sorted character list by the configured `groupBy`. */
export function groupCharacters(
  list: readonly VndbCharacter[],
  groupBy: CharacterGroupBy,
): Array<{ key: string; items: VndbCharacter[] }> {
  if (!groupBy) return [{ key: '', items: [...list] }];
  const buckets = new Map<string, VndbCharacter[]>();
  for (const c of list) {
    let key = 'unknown';
    if (groupBy === 'blood') key = (c.blood_type ?? 'unknown').toLowerCase();
    else if (groupBy === 'birthMonth') key = String(birthdayMonth(c) ?? 'unknown');
    else if (groupBy === 'sex') key = c.sex?.[0] ?? 'unknown';
    else if (groupBy === 'role') key = c.vns?.[0]?.role ?? 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  return Array.from(buckets.entries()).map(([key, items]) => ({ key, items }));
}

/**
 * Build a URL with the chip set overridden by `patch`. Use `null` to
 * clear a chip. The returned string always starts with `/characters`
 * so the helper can be passed straight to `<Link href={…}>`.
 */
export function characterBrowseHref(
  current: CharacterBrowseParams,
  patch: Partial<Record<keyof CharacterBrowseParams, string | boolean | null>>,
): string {
  const merged: Record<string, string> = {};
  const set = (key: string, value: string | boolean | null | undefined) => {
    if (value == null || value === '') return;
    if (typeof value === 'boolean') {
      merged[key] = value ? '1' : '0';
      return;
    }
    merged[key] = String(value);
  };
  set('tab', current.tab === 'local' ? null : current.tab);
  set('q', current.q || null);
  set('sex', current.sex);
  set('role', current.role);
  // Emit the canonical `bloodType` param so metadata links from
  // `/character/[id]` and the chip set on `/characters` share a
  // URL shape. The parser keeps reading `?blood=` for back-compat.
  set('bloodType', current.blood);
  set('vaLang', current.vaLang);
  set('hasVoice', current.hasVoice);
  set('hasImage', current.hasImage);
  set('birthMonth', current.birthMonth != null ? String(current.birthMonth) : null);
  set('sort', current.sort === 'name' ? null : current.sort);
  set('reverse', current.reverse ? '1' : null);
  set('groupBy', current.groupBy || null);

  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') {
      delete merged[k];
    } else if (typeof v === 'boolean') {
      merged[k] = v ? '1' : '0';
    } else {
      merged[k] = String(v);
    }
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/characters?${qs}` : '/characters';
}
