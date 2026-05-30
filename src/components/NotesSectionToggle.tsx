'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const MarkdownView = dynamic(() => import('./MarkdownView').then((m) => m.MarkdownView), { ssr: false });

interface Props {
  notes: string | null | undefined;
  emptyLabel: string;
  titleLabel: string;
  showLabel: string;
  hideLabel: string;
}

export function NotesSectionToggle({ notes, emptyLabel, titleLabel, showLabel, hideLabel }: Props) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{titleLabel}</h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" aria-hidden /> {hideLabel}</>
            : <><ChevronDown className="h-3 w-3" aria-hidden /> {showLabel}</>
          }
        </button>
      </div>
      {expanded && (
        notes
          ? <MarkdownView source={notes} />
          : <p className="text-xs text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}
