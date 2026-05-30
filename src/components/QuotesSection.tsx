'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SkeletonBlock } from './Skeleton';
import { ErrorAlert } from './ErrorAlert';
import { QuoteAvatar } from './QuoteAvatar';
import { VndbMarkup } from './VndbMarkup';
import { useT } from '@/lib/i18n/client';
import { useSectionCount } from './vn-detail/DetailSectionFrame';
import type { VndbQuote } from '@/lib/vndb-types';

import { readApiError } from '@/lib/api-error-read';
export function QuotesSection({ vnId }: { vnId: string }) {
  const t = useT();
  const [quotes, setQuotes] = useState<VndbQuote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (quotes !== null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/quotes`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
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
  }, [vnId, quotes, t.common.error]);

  useSectionCount(quotes ? quotes.length : null);

  return (
    <div className="px-6 py-5" aria-busy={loading || undefined}>
        {loading && (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`quote-skel-${i}`} className="space-y-2 rounded-lg border-l-2 border-accent bg-bg-elev/50 px-4 py-3">
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-5/6" />
                <SkeletonBlock className="ml-auto h-2.5 w-1/4" />
              </li>
            ))}
          </ul>
        )}
        {error && <ErrorAlert title={t.common.error}>{error}</ErrorAlert>}
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
                  “<VndbMarkup text={q.quote} spoilerLabel={t.spoiler.markupSummary} />”
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
  );
}
