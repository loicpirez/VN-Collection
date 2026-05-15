/**
 * Two-letter / locale-tag → display name. Used wherever VNDB's
 * bare language code (`ja`, `en`, `zh-Hans`, etc.) was previously
 * rendered as an uppercase chip — `JA` reads as cryptic acronym
 * out of context. Producers / staff / VN pages now wrap the code
 * with the full name so a hover-free chip says
 * "🌐 Japanese (ja)" instead of just "JA".
 *
 * Keep this list aligned with the VNDB schema's `languages` enum
 * (see `/schema` endpoint). New codes that aren't in this table
 * fall back to the raw uppercase form so the UI never goes blank.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Chinese',
  'zh-Hans': 'Chinese (simplified)',
  'zh-Hant': 'Chinese (traditional)',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  fi: 'Finnish',
  da: 'Danish',
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
  no: 'Norwegian',
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
};

export function languageDisplayName(code: string | null | undefined): string {
  if (!code) return '';
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}
