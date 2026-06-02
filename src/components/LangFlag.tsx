import Link from 'next/link';
import { Globe } from 'lucide-react';
import { languageDisplayName } from '@/lib/language-names';
import type { Locale } from '@/lib/i18n/dictionaries';

interface Props {
  lang: string;
  /** When true, append the language code after the icon. */
  withCode?: boolean;
  className?: string;
  /** Active UI locale used to localize the tooltip language name. */
  locale?: Locale;
}

/**
 * Globe-icon chip for a VNDB language code. Replaces the previous
 * Regional Indicator emoji rendering - the emoji set was inconsistent
 * across platforms and forced an arbitrary language→country mapping
 * (e.g. "en" → 🇬🇧 disenfranchised every other English-speaking
 * country, "zh" → 🇨🇳 dropped Hong Kong/Taiwan), and emoji was a
 * blanket exception to the project's "Lucide only" rule.
 *
 * The full localised name is supplied via `title` so a hover still
 * answers "ja → Japanese" without giving up the compact code chip.
 */
export function LangFlag({ lang, withCode = false, className = '', locale }: Props) {
  const tooltip = languageDisplayName(lang, locale);
  return (
    <span className={className} title={tooltip} aria-label={tooltip}>
      <Globe className="h-3 w-3" aria-hidden />
      {withCode && <span className="ml-1">{lang.toUpperCase()}</span>}
    </span>
  );
}

/**
 * Clickable list of language chips. Each chip is a `<Link>` to
 * `/search?langs=<code>` so the metadata row doubles as a discovery
 * surface - clicking "JA" on a VN detail page reveals every other VN
 * with a Japanese release. Used on `/vn/[id]` and `/compare`. Neither
 * caller wraps these in an outer `<a>`, so the nested-anchor footgun
 * is avoided.
 *
 * Set `clickable={false}` if a future caller embeds inside another
 * link - the chips fall back to plain `<span>` rendering.
 */
export function LangList({
  langs,
  clickable = true,
  locale,
}: {
  langs: string[];
  clickable?: boolean;
  /** Active UI locale used to localize chip names and tooltips. */
  locale?: Locale;
}) {
  if (!langs || langs.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {langs.map((l) => {
        const displayName = languageDisplayName(l, locale);
        if (!clickable) {
          return (
            <LangFlag
              key={l}
              lang={l}
              withCode
              locale={locale}
              className="inline-flex items-center gap-0.5 text-xs"
            />
          );
        }
        return (
          <Link
            key={l}
            href={`/search?langs=${encodeURIComponent(l)}`}
            title={displayName}
            aria-label={displayName}
            className="inline-flex items-center gap-0.5 rounded border border-border bg-bg-elev/40 px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
          >
            <Globe className="h-3 w-3" aria-hidden />
            <span>{l.toUpperCase()}</span>
          </Link>
        );
      })}
    </span>
  );
}
