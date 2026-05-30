'use client';
import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Edit3, Eye, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * `react-markdown` + `remark-gfm` together weigh ~100 kB gzipped and
 * are only needed when the user actually previews their notes. The
 * heavy renderer is dynamic-imported and rendered client-side only;
 * the textarea editor stays in the eager bundle.
 */
const MarkdownView = dynamic(
  () => import('./MarkdownView').then((m) => m.MarkdownView),
  {
    ssr: false,
    loading: () => (
      <p className="inline-flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      </p>
    ),
  },
);

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function MarkdownNotes({ value, onChange, placeholder }: Props) {
  const t = useT();
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const editTabId = useId();
  const previewTabId = useId();
  const editPanelId = useId();
  const previewPanelId = useId();
  const empty = !value.trim();

  return (
    <div className="rounded-lg border border-border bg-bg overflow-hidden">
      <div
        role="tablist"
        aria-label={t.markdown.viewLabel}
        className="flex items-center gap-1 border-b border-border bg-bg-elev/60 px-2 py-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = tab === 'edit' ? 'preview' : 'edit';
          setTab(next);
          document.getElementById(next === 'edit' ? editTabId : previewTabId)?.focus();
        }}
      >
        <button
          type="button"
          id={editTabId}
          role="tab"
          aria-selected={tab === 'edit'}
          aria-controls={editPanelId}
          tabIndex={tab === 'edit' ? 0 : -1}
          className={`btn btn-xs ${tab === 'edit' ? 'btn-primary' : 'text-muted hover:text-white'}`}
          onClick={() => setTab('edit')}
        >
          <Edit3 className="h-3 w-3" aria-hidden /> {t.markdown.edit}
        </button>
        <button
          type="button"
          id={previewTabId}
          role="tab"
          aria-selected={tab === 'preview'}
          aria-controls={previewPanelId}
          tabIndex={tab === 'preview' ? 0 : -1}
          className={`btn btn-xs ${tab === 'preview' ? 'btn-primary' : 'text-muted hover:text-white'}`}
          onClick={() => setTab('preview')}
        >
          <Eye className="h-3 w-3" aria-hidden /> {t.markdown.preview}
        </button>
        <span className="ml-auto text-[11px] text-muted">{t.markdown.hint}</span>
      </div>
      {tab === 'edit' ? (
        <div id={editPanelId} role="tabpanel" aria-labelledby={editTabId}>
          <textarea
            className="block w-full resize-y bg-transparent p-3 font-mono text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg placeholder:text-muted/60"
            rows={8}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? t.markdown.placeholder}
            aria-label={placeholder ?? t.markdown.placeholder}
          />
        </div>
      ) : (
        <div id={previewPanelId} role="tabpanel" aria-labelledby={previewTabId} className="prose-invert min-h-[140px] p-4 text-sm">
          {empty ? (
            <p className="text-muted">{t.markdown.empty}</p>
          ) : (
            <MarkdownView source={value} />
          )}
        </div>
      )}
    </div>
  );
}

export { MarkdownView } from './MarkdownView';
