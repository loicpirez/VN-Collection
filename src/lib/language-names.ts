/**
 * VNDB language code → display name. Used wherever VNDB's bare
 * language code (`ja`, `en`, `zh-Hans`) is rendered as a chip.
 *
 * All keys are stored lowercase; `languageDisplayName` lowercases
 * the input before lookup so mixed-case inputs like `'zh-Hans'`,
 * `'ZH-HANS'`, and `'zh-hans'` all resolve.
 *
 * Aligned with the VNDB `/schema` endpoint's `languages` enum.
 * Unknown codes fall back to the raw uppercase form.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Chinese',
  'zh-hans': 'Chinese (Simplified)',
  'zh-hant': 'Chinese (Traditional)',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  'pt-pt': 'Portuguese (Portugal)',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  fi: 'Finnish',
  da: 'Danish',
  no: 'Norwegian',
  nb: 'Norwegian Bokmål',
  nn: 'Norwegian Nynorsk',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  tr: 'Turkish',
  ar: 'Arabic',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  el: 'Greek',
  ca: 'Catalan',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  et: 'Estonian',
  fa: 'Persian',
  hi: 'Hindi',
  ta: 'Tamil',
  bn: 'Bengali',
  ur: 'Urdu',
  eo: 'Esperanto',
  la: 'Latin',
  is: 'Icelandic',
  ga: 'Irish',
  mk: 'Macedonian',
  sr: 'Serbian',
  sq: 'Albanian',
  tl: 'Tagalog',
  fil: 'Filipino',
  af: 'Afrikaans',
  sw: 'Swahili',
  iu: 'Inuktitut',
  mi: 'Maori',
};

/**
 * Returns the display name for a VNDB language code in the given locale.
 *
 * Uses `Intl.DisplayNames` when available (locale-aware) with the static
 * map as a fallback for environments where Intl is not available or the
 * code is unrecognised by the runtime.
 */
export function languageDisplayName(
  code: string | null | undefined,
  locale = 'en',
): string {
  if (!code) return '';
  try {
    const dn = new Intl.DisplayNames([locale, 'en'], { type: 'language' });
    const name = dn.of(code);
    if (name && name !== code) return name;
  } catch {
    // Fall through to static map.
  }
  const lower = code.toLowerCase();
  return LANGUAGE_NAMES[lower] ?? code.toUpperCase();
}
