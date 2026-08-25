/**
 * Human-readable platform labels for VNDB platform codes.
 *
 * VNDB's `/vn`, `/release`, and the persisted `release_meta_cache`
 * all use short three-letter platform codes ("win", "ps4", "swi").
 * uppercase ("WIN", "PS4", "SWI") read as in-jargon and were flagged
 * by manual QA as opaque. This helper centralises the mapping so
 * every consumer renders the same friendly label.
 *
 * Rules:
 *   - URL parameters and DB columns keep the RAW lowercase code —
 *     this helper is presentation-only. Hover tooltips / aria-label
 *     should expose the raw code so power users can still see "win".
 *   - Lookup is case-insensitive.
 *   - Accessible names and tooltips use the human-readable label. A compact
 *     disclosure may append the raw code as secondary context.
 *   - Codes that aren't in the map fall back to their UPPERCASE form
 *     so we never render an empty chip.
 *
 * The codes below are sourced from VNDB's `release.platforms`
 * enumeration (https://api.vndb.org/kana#enumerated-fields).
 */

import type { Locale } from '@/lib/i18n/dictionaries';

export const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  win: 'Windows',
  mac: 'macOS',
  lin: 'Linux',
  dos: 'MS-DOS',
  // VNDB uses `n3d` (NOT `3ds`) for Nintendo 3DS; both forms map to
  // the same label so we tolerate either if the upstream enum
  // changes. The `n3d` form is the one actually in
  // production `release.platforms` payloads.
  '3ds': 'Nintendo 3DS',
  n3d: 'Nintendo 3DS',
  nds: 'Nintendo DS',
  wii: 'Wii',
  wiu: 'Wii U',
  swi: 'Nintendo Switch',
  ps1: 'PlayStation',
  ps2: 'PlayStation 2',
  ps3: 'PlayStation 3',
  ps4: 'PlayStation 4',
  ps5: 'PlayStation 5',
  psp: 'PlayStation Portable',
  psv: 'PlayStation Vita',
  xb1: 'Xbox',
  x36: 'Xbox 360',
  xb3: 'Xbox 360',  // VNDB alias seen in real payloads.
  xbo: 'Xbox One',
  xxs: 'Xbox Series X/S',
  and: 'Android',
  ios: 'iOS',
  mob: 'Mobile',     // Generic-mobile bucket on older VNDB rows.
  bdp: 'Blu-ray Player',
  web: 'Web',
  dvd: 'DVD Player',
  drc: 'Dreamcast',
  fmt: 'FM Towns',
  gba: 'Game Boy Advance',
  gbc: 'Game Boy Color',
  msx: 'MSX',
  n64: 'Nintendo 64',
  nes: 'NES',
  pce: 'PC Engine',
  pcf: 'PC-FX',
  p88: 'PC-8800',
  p98: 'PC-9800',
  x68: 'X68000',    // Sharp X68000.
  sat: 'Sega Saturn',
  scd: 'Sega CD',
  sfc: 'Super Famicom',
  smd: 'Sega Mega Drive',
  tdo: '3DO',
  vnd: 'V.Flash',
  oth: 'Other',
};

const PLATFORM_LABEL_OVERRIDES: Readonly<Partial<Record<Locale, Readonly<Record<string, string>>>>> = {
  fr: {
    bdp: 'Lecteur Blu-ray',
    dvd: 'Lecteur DVD',
    oth: 'Autre',
  },
  ja: {
    n3d: 'ニンテンドー3DS',
    '3ds': 'ニンテンドー3DS',
    nds: 'ニンテンドーDS',
    ps1: 'プレイステーション',
    psp: 'プレイステーション・ポータブル',
    mob: 'モバイル',
    bdp: 'Blu-ray プレーヤー',
    web: 'ウェブ',
    dvd: 'DVDプレーヤー',
    drc: 'ドリームキャスト',
    gba: 'ゲームボーイアドバンス',
    gbc: 'ゲームボーイカラー',
    pce: 'PCエンジン',
    sat: 'セガサターン',
    sfc: 'スーパーファミコン',
    smd: 'メガドライブ',
    oth: 'その他',
  },
};

/** Platform codes kept visible first in dense search and filter controls. */
export const COMMON_PLATFORM_CODES: readonly string[] = [
  'win', 'lin', 'mac', 'ios', 'and', 'web', 'swi', 'ps4', 'ps5', 'psv', 'psp', 'xb1', 'xxs', 'n3d',
];

const PLATFORM_ALIASES = new Set(['3ds', 'xb3']);

/**
 * Complete canonical VNDB platform catalog in UI order. Compatibility aliases
 * remain valid in {@link platformLabel} but are excluded from query controls.
 */
export const PLATFORM_CODES: readonly string[] = [
  ...COMMON_PLATFORM_CODES,
  ...Object.keys(PLATFORM_LABELS)
    .filter((code) => !COMMON_PLATFORM_CODES.includes(code) && !PLATFORM_ALIASES.has(code))
    .sort((a, b) => PLATFORM_LABELS[a].localeCompare(PLATFORM_LABELS[b], 'en')),
];

/**
 * Return the locale-aware human-readable label for a VNDB platform code.
 * Case-insensitive. Unknown codes fall back to their uppercase form
 * so the caller can render the raw token unchanged.
 *
 * @param code - VNDB platform code.
 * @param locale - Active UI locale; English is the compatibility default.
 * @returns Localized platform name or an uppercase raw-code fallback.
 */
export function platformLabel(code: string, locale: Locale = 'en'): string {
  if (!code) return code;
  const norm = code.toLowerCase();
  return PLATFORM_LABEL_OVERRIDES[locale]?.[norm] ?? PLATFORM_LABELS[norm] ?? code.toUpperCase();
}
