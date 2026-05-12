'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquareQuote } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import type { VndbQuote } from '@/lib/vndb-types';

export function QuotesSection({ vnId }: { vnId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [quotes, setQuotes] = useState<VndbQuote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || quotes !== null) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/quotes`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { quotes: VndbQuote[] }) => alive && setQuotes(d.quotes))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, vnId, quotes, t.common.error]);

  return (
    <details
      className="group rounded-xl border border-border bg-bg-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 hover:bg-bg-elev/50">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <MessageSquareQuote className="h-4 w-4 text-accent" /> {t.quotes.section}
          {quotes && <span className="text-[11px] font-normal text-muted">· {quotes.length}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </summary>
      <div className="border-t border-border px-6 py-5">
        {loading && (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="space-y-2 rounded-lg border-l-2 border-accent bg-bg-elev/50 px-4 py-3">
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-5/6" />
                <SkeletonBlock className="ml-auto h-2.5 w-1/4" />
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-status-dropped">{error}</p>}
        {!loading && quotes && quotes.length === 0 && <p className="text-sm text-muted">{t.quotes.empty}</p>}
        {quotes && quotes.length > 0 && (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li
                key={q.id}
                className="rounded-lg border-l-2 border-accent bg-bg-elev/50 px-4 py-3 italic text-white/90"
              >
                <span className="block whitespace-pre-wrap text-sm">“{q.quote}”</span>
                {q.character && (
                  <span className="mt-2 block text-right text-xs not-italic text-muted">
                    — {q.character.name}
                    {q.character.original && ` · ${q.character.original}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
