'use client';
import { useState } from 'react';
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
  const empty = !value.trim();

  return (
    <div className="rounded-lg border border-border bg-bg overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border bg-bg-elev/60 px-2 py-1">
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            tab === 'edit' ? 'bg-accent text-bg' : 'text-muted hover:text-white'
          }`}
          onClick={() => setTab('edit')}
        >
          <Edit3 className="h-3 w-3" aria-hidden /> {t.markdown.edit}
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            tab === 'preview' ? 'bg-accent text-bg' : 'text-muted hover:text-white'
          }`}
          onClick={() => setTab('preview')}
        >
          <Eye className="h-3 w-3" aria-hidden /> {t.markdown.preview}
        </button>
        <span className="ml-auto text-[11px] text-muted">{t.markdown.hint}</span>
      </div>
      {tab === 'edit' ? (
        <textarea
          className="block w-full resize-y bg-transparent p-3 font-mono text-sm text-white outline-none placeholder:text-muted/60"
          rows={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t.markdown.placeholder}
          aria-label={placeholder ?? t.markdown.placeholder}
        />
      ) : (
        <div className="prose-invert min-h-[140px] p-4 text-sm">
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
