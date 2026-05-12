'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquareQuote, RefreshCcw, Loader2 } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import type { VndbQuote } from '@/lib/vndb-types';

export function QuoteFooter() {
  const t = useT();
  const [quote, setQuote] = useState<VndbQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/vndb/quote/random', { cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = await r.json();
      setQuote(d.quote);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t.common.error]);

  // Load only when the user actually hovers — never on page load.
  useEffect(() => {
    if (hovered && !fetchedRef.current) {
      fetchedRef.current = true;
      load();
    }
  }, [hovered, load]);

  return (
    <footer
      className="group fixed bottom-0 left-0 right-0 z-20"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="overflow-hidden rounded-t-md border border-b-0 border-border bg-bg/95 backdrop-blur transition-[max-height] duration-300 ease-out max-h-7 group-hover:max-h-28 group-focus-within:max-h-28">
          <div className="flex items-center gap-2 px-3 py-1 text-[11px]">
            <MessageSquareQuote className="h-3 w-3 shrink-0 text-muted transition-colors group-hover:text-accent" aria-hidden />
            <span className="shrink-0 font-medium uppercase tracking-wider text-muted/70 transition-colors group-hover:text-muted">
              {t.quotes.randomTitle}
            </span>
            <span
              className={`flex-1 truncate text-muted/50 transition-opacity duration-200 ${
                hovered ? 'opacity-0' : 'opacity-100'
              }`}
              aria-hidden="true"
            >
              {t.quotes.hoverHint}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                fetchedRef.current = true;
                load();
              }}
              disabled={loading}
              className={`shrink-0 rounded text-muted transition-opacity duration-200 hover:text-white disabled:opacity-50 ${
                hovered ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-label={t.quotes.shuffle}
              title={t.quotes.shuffle}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCcw className="h-3 w-3" aria-hidden />}
            </button>
          </div>

          <div
            className={`px-3 pb-2 transition-opacity duration-300 ${
              hovered ? 'opacity-100 delay-75' : 'opacity-0'
            }`}
          >
            {error && <p className="text-[11px] text-status-dropped">{error}</p>}
            {!error && !quote && loading && (
              <div className="space-y-1.5">
                <SkeletonBlock className="h-3 w-5/6" />
                <SkeletonBlock className="h-3 w-2/3" />
                <SkeletonBlock className="ml-auto h-2.5 w-1/4" />
              </div>
            )}
            {quote && (
              <blockquote className="border-l-2 border-accent pl-2 italic text-white/85">
                <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-snug">“{quote.quote}”</p>
                <footer className="mt-0.5 text-right text-[10px] not-italic text-muted">
                  {quote.character && quote.character.id ? (
                    <Link href={`/character/${quote.character.id}`} className="hover:text-accent">
                      — {quote.character.name}
                    </Link>
                  ) : quote.character ? (
                    <span>— {quote.character.name}</span>
                  ) : null}
                  {quote.vn && (
                    <>
                      {quote.character && ' · '}
                      <Link href={`/vn/${quote.vn.id}`} className="hover:text-accent">
                        {quote.vn.title}
                      </Link>
                    </>
                  )}
                </footer>
              </blockquote>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
