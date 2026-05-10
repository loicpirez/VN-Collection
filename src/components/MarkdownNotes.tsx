'use client';
import { useState } from 'react';
import { Edit3, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useT } from '@/lib/i18n/client';

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
          <Edit3 className="h-3 w-3" /> {t.markdown.edit}
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            tab === 'preview' ? 'bg-accent text-bg' : 'text-muted hover:text-white'
          }`}
          onClick={() => setTab('preview')}
        >
          <Eye className="h-3 w-3" /> {t.markdown.preview}
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

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-white/90 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_a]:text-accent-blue [&_a:hover]:underline [&_code]:rounded [&_code]:bg-bg-elev [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-elev [&_pre]:p-3 [&_pre]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
