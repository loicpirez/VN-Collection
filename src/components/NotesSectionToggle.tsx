'use client';
import dynamic from 'next/dynamic';

const MarkdownView = dynamic(() => import('./MarkdownView').then((m) => m.MarkdownView), { ssr: false });

interface Props {
  notes: string | null | undefined;
  emptyLabel: string;
}

/**
 * Personal-notes body for the VN detail page. Collapse and the
 * section header are owned by the enclosing `DetailSectionFrame`; this
 * renders the rendered markdown or the empty-state line.
 */
export function NotesSectionToggle({ notes, emptyLabel }: Props) {
  return (
    <div className="p-4 sm:p-6">
      {notes ? <MarkdownView source={notes} /> : <p className="text-xs text-muted">{emptyLabel}</p>}
    </div>
  );
}
