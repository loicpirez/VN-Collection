'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MarkdownView } from './MarkdownView';

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
    <div className="rounded-xl border border-border/70 bg-bg-card/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">{titleLabel}</span>
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
        <div className="mt-2.5 border-t border-border/40 pt-2.5">
          {notes
            ? <MarkdownView source={notes} />
            : <p className="text-xs text-muted">{emptyLabel}</p>
          }
        </div>
      )}
    </div>
  );
}
