// VNDB language code → ISO-3166 country code (used for the flag emoji).
// VNDB uses a mix of BCP-47-ish tags ("en", "zh-Hans", "pt-br", "nb"…). We map
// each to the most commonly associated country flag for the language.
const LANG_TO_COUNTRY: Record<string, string> = {
  en: 'GB',
  ja: 'JP',
  'zh-Hans': 'CN',
  zh: 'CN',
  cn: 'CN',
  'zh-Hant': 'TW',
  tw: 'TW',
  ko: 'KR',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  ru: 'RU',
  uk: 'UA',
  pl: 'PL',
  pt: 'PT',
  'pt-br': 'BR',
  pb: 'BR',
  cs: 'CZ',
  hu: 'HU',
  vi: 'VN',
  th: 'TH',
  id: 'ID',
  ms: 'MY',
  ar: 'SA',
  he: 'IL',
  tr: 'TR',
  nl: 'NL',
  sv: 'SE',
  no: 'NO',
  nb: 'NO',
  da: 'DK',
  fi: 'FI',
  ca: 'ES',
  el: 'GR',
  ro: 'RO',
  hr: 'HR',
  sk: 'SK',
  sl: 'SI',
  bg: 'BG',
  sr: 'RS',
};

function flagOf(lang: string): string | null {
  const country = LANG_TO_COUNTRY[lang] ?? LANG_TO_COUNTRY[lang.toLowerCase()] ?? null;
  if (!country) return null;
  // Convert ASCII letters → regional indicator symbols
  return [...country.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

interface Props {
  lang: string;
  /** When true, append the language code after the flag (e.g. "🇫🇷 fr"). */
  withCode?: boolean;
  className?: string;
}

export function LangFlag({ lang, withCode = false, className = '' }: Props) {
  const flag = flagOf(lang);
  if (!flag && !withCode) return <span className={className}>{lang.toUpperCase()}</span>;
  return (
    <span className={className} title={lang}>
      {flag && <span aria-hidden>{flag}</span>}
      {withCode && (
        <span className={flag ? 'ml-1' : ''}>{lang.toUpperCase()}</span>
      )}
    </span>
  );
}

export function LangList({ langs }: { langs: string[] }) {
  if (!langs || langs.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      {langs.map((l) => (
        <LangFlag key={l} lang={l} withCode className="inline-flex items-baseline gap-0.5 text-xs" />
      ))}
    </span>
  );
}
