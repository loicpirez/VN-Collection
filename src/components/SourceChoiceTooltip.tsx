'use client';

import type { ReactNode } from 'react';
import type { SourceChoice } from '@/lib/source-resolve';
import { useT } from '@/lib/i18n/client';
import { Tooltip } from './Tooltip';

interface SourceChoiceTooltipProps {
  choice: SourceChoice;
  children: ReactNode;
}

/**
 * Explain the persistence and fallback semantics of a compare-source action.
 *
 * @param props - Source choice and the action element receiving the tooltip.
 * @returns A keyboard- and pointer-revealed localized source explanation.
 */
export function SourceChoiceTooltip({ choice, children }: SourceChoiceTooltipProps) {
  const t = useT();
  const content = choice === 'auto'
    ? t.compare.sourceAutoHint
    : choice === 'vndb'
      ? t.compare.sourceVndbHint
      : choice === 'egs'
        ? t.compare.sourceEgsHint
        : t.compare.sourceCustomHint;
  return <Tooltip content={content}>{children}</Tooltip>;
}
