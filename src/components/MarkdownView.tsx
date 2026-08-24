'use client';
import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useT } from '@/lib/i18n/client';

/**
 * Heavy markdown renderer extracted into its own module so
 * `MarkdownNotes` can `next/dynamic` it - the bundle for
 * `react-markdown` + `remark-gfm` only ships when the user opens
 * the preview tab.
 */
export function MarkdownView({ source }: { source: string }) {
  const t = useT();
  return (
    <div className="space-y-2 text-sm leading-relaxed text-white/90 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_a]:text-accent-blue [&_a:hover]:underline [&_code]:rounded [&_code]:bg-bg-elev [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-elev [&_pre]:p-3 [&_pre]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }: ComponentProps<'table'>) => (
            <div role="region" aria-label={t.markdown.tableRegion} className="max-w-full overflow-x-auto">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
