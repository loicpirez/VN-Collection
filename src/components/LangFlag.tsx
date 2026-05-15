import { Globe } from 'lucide-react';
import { languageDisplayName } from '@/lib/language-names';

interface Props {
  lang: string;
  /** When true, append the language code after the icon. */
  withCode?: boolean;
  className?: string;
}

/**
 * Globe-icon chip for a VNDB language code. Replaces the previous
 * Regional Indicator emoji rendering — the emoji set was inconsistent
 * across platforms and forced an arbitrary language→country mapping
 * (e.g. "en" → 🇬🇧 disenfranchised every other English-speaking
 * country, "zh" → 🇨🇳 dropped Hong Kong/Taiwan), and emoji was a
 * blanket exception to the project's "Lucide only" rule.
 *
 * The full localised name is supplied via `title` so a hover still
 * answers "ja → Japanese" without giving up the compact code chip.
 */
export function LangFlag({ lang, withCode = false, className = '' }: Props) {
  const displayName = languageDisplayName(lang);
  const tooltip = displayName || lang.toUpperCase();
  return (
    <span className={className} title={tooltip}>
      <Globe className="h-3 w-3" aria-hidden />
      {withCode && <span className="ml-1">{lang.toUpperCase()}</span>}
    </span>
  );
}

export function LangList({ langs }: { langs: string[] }) {
  if (!langs || langs.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {langs.map((l) => (
        <LangFlag key={l} lang={l} withCode className="inline-flex items-center gap-0.5 text-xs" />
      ))}
    </span>
  );
}
