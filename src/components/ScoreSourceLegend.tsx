'use client';

import { useT } from '@/lib/i18n/client';
import { Tooltip } from './Tooltip';

export type ScoreLegendSource = 'unified' | 'vndb' | 'egs' | 'mine';

interface ScoreSourceLegendProps {
  sources: readonly ScoreLegendSource[];
  className?: string;
}

/**
 * Render a shared compact legend for every score source used on VN details.
 *
 * @param props - Ordered source keys and optional layout classes.
 * @returns A labelled list whose focusable chips explain score semantics.
 */
export function ScoreSourceLegend({ sources, className = '' }: ScoreSourceLegendProps) {
  const t = useT();
  const definitions: Record<ScoreLegendSource, { label: string; hint: string; dot: string }> = {
    unified: {
      label: t.detail.scoreUnified,
      hint: t.detail.scoreUnifiedHint,
      dot: 'bg-accent',
    },
    vndb: {
      label: t.detail.scoreVndb,
      hint: t.detail.scoreVndbHint,
      dot: 'bg-muted',
    },
    egs: {
      label: t.detail.scoreEgs,
      hint: t.detail.scoreEgsHint,
      dot: 'bg-accent-blue',
    },
    mine: {
      label: t.detail.myRatingLabel,
      hint: t.detail.scoreMineLegendHint,
      dot: 'bg-status-completed',
    },
  };

  return (
    <div
      role="list"
      aria-label={t.detail.scoreLegendLabel}
      className={`flex flex-wrap items-center gap-1.5 text-[10px] ${className}`}
    >
      {sources.map((source) => {
        const definition = definitions[source];
        return (
          <Tooltip key={source} content={definition.hint} side="bottom">
            <span
              role="listitem"
              tabIndex={0}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border/70 bg-bg-elev/30 px-2 text-muted outline-none hover:border-accent hover:text-white focus-visible:border-accent focus-visible:text-white can-hover:sm:min-h-0 sm:py-1"
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${definition.dot}`} />
              {definition.label}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
