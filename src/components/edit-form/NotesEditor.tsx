'use client';
import { memo } from 'react';
import { useT } from '@/lib/i18n/client';
import { MarkdownNotes } from '../MarkdownNotes';

interface Props {
  notes: string;
  onNotesChange: (next: string) => void;
}

/**
 * P-157: memoized "Personal notes" block. State stays in EditForm; this
 * block receives the notes value plus a stable setter so typing in the
 * tracking/editions groups does not re-render the markdown editor.
 */
export const NotesEditor = memo(function NotesEditor({ notes, onNotesChange }: Props) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{t.form.personalNotes}</h3>
      <MarkdownNotes value={notes} onChange={onNotesChange} />
    </div>
  );
});
