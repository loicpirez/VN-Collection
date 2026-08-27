'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Loader2, MessageSquareQuote, RefreshCcw } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { QuoteAvatar } from './QuoteAvatar';
import { ErrorAlert } from './ErrorAlert';
import { PageSpaceFrame } from './PageSpaceFrame';
import { useT } from '@/lib/i18n/client';
import type { VndbQuote } from '@/lib/vndb-types';

import { readApiError } from '@/lib/api-error-read';
import { decodeRandomQuoteResponse } from '@/lib/quote-client-shape';
export function QuoteFooter() {
  const t = useT();
  const [quote, setQuote] = useState<VndbQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pointerPreview, setPointerPreview] = useState(false);
  const fetchedRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/vndb/quote/random', { cache: 'no-store', signal: ac.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const quote = decodeRandomQuoteResponse(await r.json());
      if (quote === undefined) throw new Error(t.common.error);
      if (requestId !== requestIdRef.current || ac.signal.aborted) return;
      setQuote(quote);
    } catch (e) {
      if (requestId !== requestIdRef.current || ac.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (requestId === requestIdRef.current && !ac.signal.aborted) setLoading(false);
    }
  }, [t.common.error]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const expanded = open || pointerPreview;

  useEffect(() => {
    if (expanded && !fetchedRef.current) {
      fetchedRef.current = true;
      load();
    }
  }, [expanded, load]);

  const toggle = () => {
    setOpen(!expanded);
    setPointerPreview(false);
  };

  return (
    <div
      // Render as a plain <div>: the outer layout already wraps this
      // component in a `<footer role="contentinfo">` landmark. A
      // second `<footer>` here would create nested landmarks that
      // SR users can't easily distinguish.
      data-visual-viewport-anchor
      className={`visual-viewport-anchor-bottom z-layer-footer pointer-events-none ${expanded ? 'is-open' : ''}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setPointerPreview(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setPointerPreview(false);
      }}
    >
      <PageSpaceFrame>
        <div
          data-quote-footer-surface
          className="pointer-events-auto bg-bg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div
            data-quote-footer-panel
            className={`overflow-hidden rounded-t-md border border-b-0 border-border bg-bg transition-[max-height] duration-300 ease-out ${
              expanded ? 'max-h-28' : 'max-h-12 can-hover:sm:max-h-5'
            }`}
          >
            <div className="flex items-center text-[10px]">
              <button
                type="button"
                onClick={toggle}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted hover:text-white can-hover:sm:min-h-0 can-hover:sm:py-0.5"
                aria-expanded={expanded}
                aria-controls="quote-footer-content"
                aria-label={expanded ? t.quotes.collapse : t.quotes.expand}
                title={expanded ? t.quotes.collapse : t.quotes.expand}
              >
                <MessageSquareQuote className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                <span className="shrink-0 font-medium uppercase tracking-wider text-muted/70">
                  {t.quotes.randomTitle}
                </span>
                <span className={`flex-1 truncate text-muted/50 transition-opacity duration-200 ${expanded ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true">
                  {t.quotes.hoverHint}
                </span>
                {expanded
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  : <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  fetchedRef.current = true;
                  load();
                }}
                disabled={loading}
                className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-muted transition-opacity duration-200 hover:text-white disabled:opacity-50 ${
                  expanded ? 'opacity-100' : 'opacity-100 can-hover:sm:pointer-events-none can-hover:sm:h-3 can-hover:sm:min-h-0 can-hover:sm:w-3 can-hover:sm:min-w-0 can-hover:sm:opacity-0'
                }`}
                aria-label={t.quotes.shuffle}
                title={t.quotes.shuffle}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCcw className="h-3 w-3" aria-hidden />}
              </button>
            </div>

            <div
              id="quote-footer-content"
              hidden={!expanded}
              className="px-3 pb-2"
            >
              {error && <ErrorAlert title={t.common.error}>{error}</ErrorAlert>}
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
                  <footer className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] not-italic text-muted">
                    {quote.character && (
                      // Smaller 20x20 avatar - the footer collapses to
                      // a single line on hover so the portrait stays
                      // proportional to the body text. UserCircle
                      // fallback kicks in when no local portrait was
                      // mirrored.
                      <QuoteAvatar quote={quote} size={20} />
                    )}
                    {quote.character ? (
                      <Link href={`/character/${quote.character.id}`} className="hover:text-accent">
                        - {quote.character.name}
                      </Link>
                    ) : null}
                    {quote.vn && (
                      <>
                        {quote.character && ' / '}
                        <Link prefetch={false} href={`/vn/${quote.vn.id}`} className="hover:text-accent">
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
      </PageSpaceFrame>
    </div>
  );
}
