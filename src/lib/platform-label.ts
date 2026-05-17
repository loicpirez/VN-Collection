/**
 * Human-readable platform labels for VNDB platform codes.
 *
 * VNDB's `/vn`, `/release`, and the persisted `release_meta_cache`
 * all use short three-letter platform codes ("win", "ps4", "swi").
 * Surfaces that previously rendered the raw code in
 * uppercase ("WIN", "PS4", "SWI") read as in-jargon and were flagged
 * by manual QA as opaque. This helper centralises the mapping so
 * every consumer renders the same friendly label.
 *
 * Rules:
 *   - URL parameters and DB columns keep the RAW lowercase code —
 *     this helper is presentation-only. Hover tooltips / aria-label
 *     should expose the raw code so power users can still see "win".
 *   - Lookup is case-insensitive.
 *   - Codes that aren't in the map fall back to their UPPERCASE form
 *     so we never render an empty chip.
 *
 * The codes below are sourced from VNDB's `release.platforms`
 * enumeration (https://api.vndb.org/kana#enumerated-fields).
 */

export const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  win: 'Windows',
  mac: 'macOS',
  lin: 'Linux',
  nds: 'Nintendo DS',
  '3ds': 'Nintendo 3DS',
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
  xbo: 'Xbox One',
  xxs: 'Xbox Series X/S',
  and: 'Android',
  ios: 'iOS',
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
  sat: 'Sega Saturn',
  scd: 'Sega CD',
  sfc: 'Super Famicom',
  smd: 'Sega Mega Drive',
  tdo: '3DO',
  vnd: 'V.Flash',
  oth: 'Other',
};

/**
 * Return the human-readable label for a VNDB platform code.
 * Case-insensitive. Unknown codes fall back to their uppercase form
 * so the caller can render the raw token unchanged.
 */
export function platformLabel(code: string): string {
  if (!code) return code;
  const norm = code.toLowerCase();
  return PLATFORM_LABELS[norm] ?? code.toUpperCase();
}
