'use client';
import { useT } from '@/lib/i18n/client';

export type GlossaryAcronym = 'vndb' | 'egs' | 'gps';

const ACRONYM_TEXT: Record<GlossaryAcronym, string> = {
  vndb: 'VNDB',
  egs: 'EGS',
  gps: 'GPS',
};

/**
 * Render a domain acronym with one localized expansion shared across controls.
 *
 * @param acronym Glossary key to render.
 * @param className Optional presentation classes for the abbreviation.
 * @returns A semantic abbreviation whose visible label remains canonical.
 */
export function AcronymLabel({ acronym, className = '' }: { acronym: GlossaryAcronym; className?: string }) {
  const t = useT();
  return (
    <abbr
      title={t.acronyms[acronym]}
      className={`cursor-help decoration-dotted underline-offset-2 ${className}`}
    >
      {ACRONYM_TEXT[acronym]}
    </abbr>
  );
}
