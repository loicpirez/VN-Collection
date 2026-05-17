'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, MessageSquareQuote } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { QuoteAvatar } from './QuoteAvatar';
import { VndbMarkup } from './VndbMarkup';
import { useT } from '@/lib/i18n/client';
import type { VndbQuote } from '@/lib/vndb-types';

export function QuotesSection({
  vnId,
  initialOpen = false,
}: {
  vnId: string;
  /** First-paint open state — wired to the VN layout host's
   *  `collapsedByDefault` so unticking the setting actually opens
   *  the section on initial render. */
  initialOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  const [quotes, setQuotes] = useState<VndbQuote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || quotes !== null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/quotes`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { quotes: VndbQuote[] }) => {
        if (!ac.signal.aborted) setQuotes(d.quotes);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
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
                {/*
                  Quotes pass through VndbMarkup so any embedded
                  BBCode (`[url=…]`, `[spoiler]`) AND inline VNDB
                  refs (`cNNN`, `https://vndb.org/cNNN`) are
                  parsed into real links via normalizeVndbHref.
                  The quote stays italic via the parent `<li>` and
                  the open/close quotation marks wrap the rendered
                  markup nodes, not the raw string.
                */}
                <span className="block whitespace-pre-wrap text-sm">
                  “<VndbMarkup text={q.quote} />”
                </span>
                {q.character && (
                  // Right-aligned citation row: avatar + character
                  // name (linked when we know the character id).
                  // QuoteAvatar handles the UserCircle fallback when
                  // no local portrait is available, so the row stays
                  // visually balanced regardless of image presence.
                  <span className="mt-2 flex items-center justify-end gap-2 text-xs not-italic text-muted">
                    <QuoteAvatar quote={q} size={28} />
                    {q.character.id ? (
                      <Link
                        href={`/character/${q.character.id}`}
                        className="hover:text-accent"
                      >
                        — {q.character.name}
                        {q.character.original && ` · ${q.character.original}`}
                      </Link>
                    ) : (
                      <span>
                        — {q.character.name}
                        {q.character.original && ` · ${q.character.original}`}
                      </span>
                    )}
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
