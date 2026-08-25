'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileText, Library, MessageSquareQuote, Quote } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { SkeletonBlock } from './Skeleton';
import { SafeImage } from './SafeImage';
import { readApiError } from '@/lib/api-error-read';
import { decodeCollectionFindMatches, type CollectionFindMatch } from '@/lib/collection-find-client-shape';
import { decodeTextualSearchHits, type TextualSearchHit } from '@/lib/browse-client-shape';
import { hasEnoughStrongLocalMatches } from '@/lib/textual-search-policy';

const ICONS = {
  notes: FileText,
  custom_description: MessageSquareQuote,
  quote: Quote,
};

/**
 * Free-text search across LOCAL-ONLY fields: the user's personal
 * notes, custom synopsis overrides, and cached VN quotes.
 *
 * Renders BELOW the main VNDB/EGS results as a collapsed accordion.
 * The user's mental model when typing in the search bar is "find
 * me a VN on VNDB"; this panel is a secondary affordance for when
 * the user types text they wrote into their notes. Previous
 * rendering put it ABOVE the main results with full row dump,
 * which manual QA flagged as hijacking the search experience.
 *
 * Collapsed-by-default: shows a single line with the hit count and
 * a chevron. Click to expand the rows. If there are no hits, the
 * component renders nothing.
 *
 * Debounces at 280ms to avoid flooding the API for every keystroke.
 */
export function TextualSearchPanel({
  query,
  mode = 'accordion',
}: {
  query: string;
  /**
   * 'accordion' (default): below-results collapsed accordion used
   * when the user is browsing VNDB/EGS results - keeps the local
   * notes / quotes a one-click reveal that never hijacks the
   * remote results.
   * 'standalone': /search?source=local - render expanded, show
   * the empty/hero state when the query is short or zero hits
   * exist, and never collapse.
   */
  mode?: 'accordion' | 'standalone';
}) {
  const t = useT();
  const panelId = useId();
  const [libraryHits, setLibraryHits] = useState<CollectionFindMatch[]>([]);
  const [hits, setHits] = useState<TextualSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(mode === 'standalone');
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLibraryHits([]);
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const run = async () => {
        const libraryResponse = await fetch(`/api/collection/find?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!libraryResponse.ok) throw new Error(await readApiError(libraryResponse, t.common.error));
        const library = decodeCollectionFindMatches(await libraryResponse.json());
        if (!library) throw new Error(t.common.error);
        if (!alive || ctrl.signal.aborted) return;

        if (mode === 'accordion' && hasEnoughStrongLocalMatches(trimmed, library)) {
          setLibraryHits(library);
          setHits([]);
          setError(null);
          return;
        }

        const textualResponse = await fetch(`/api/search/textual?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!textualResponse.ok) throw new Error(await readApiError(textualResponse, t.common.error));
        const textual = decodeTextualSearchHits(await textualResponse.json());
        if (!textual) throw new Error(t.common.error);
        if (!alive || ctrl.signal.aborted) return;
        setLibraryHits(library);
        setHits(textual);
        setError(null);
      };
      void run()
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError' || ctrl.signal.aborted) return;
          console.error('[TextualSearchPanel] search failed:', e);
          setLibraryHits([]);
          setHits([]);
          setError(e instanceof Error && e.message ? e.message : t.common.error);
          setOpen(true);
        })
        .finally(() => { if (alive) setLoading(false); });
    }, 280);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [mode, query, t.common.error, retryNonce]);

  if (mode === 'accordion') {
    if (query.trim().length < 2) return null;
    if (!loading && !error && libraryHits.length === 0 && hits.length === 0) return null;
  } else {
    if (query.trim().length < 2) {
      return (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">{t.search.localHeroTitle}</h2>
          <p className="text-muted">{t.search.localHeroSubtitle}</p>
        </div>
      );
    }
    if (!loading && !error && libraryHits.length === 0 && hits.length === 0) {
      return <div className="py-20 text-center text-muted">{t.textualSearch.empty}</div>;
    }
  }

  const resultCount = libraryHits.length + hits.length;
  const statusText = loading
    ? t.textualSearch.statusLoading
    : error
      ? t.textualSearch.statusError
      : (t.textualSearch.statusCount as string).replace('{n}', String(resultCount));

  return (
    <section className={`${mode === 'standalone' ? '' : 'mt-6'} rounded-xl border border-border bg-bg-card/60`}>
      <span className="sr-only" role="status" aria-live="polite">
        {statusText}
      </span>
      {mode === 'accordion' && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-bg-card"
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {t.textualSearch.title}
            </span>
            {loading ? (
              <span className="text-[10px] text-muted">/ {t.common.loading}</span>
            ) : error ? (
              <span className="text-[10px] text-status-dropped">/ {t.common.error}</span>
            ) : (
              <span className="rounded-full bg-bg-elev/50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted">
                {resultCount}
              </span>
            )}
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
          )}
        </button>
      )}
      {open && (
        <div id={panelId} className={`${mode === 'standalone' ? '' : 'border-t border-border'} px-3 pb-3 pt-2`}>
          <p className="mb-2 text-[10px] text-muted/80">{t.textualSearch.hint}</p>
          {error ? (
            <div role="alert" className="rounded-md border border-status-dropped/40 bg-status-dropped/10 p-3 text-xs text-status-dropped">
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-[44px] items-center rounded-md border border-status-dropped/40 px-2 py-1 font-semibold hover:bg-status-dropped/10 can-hover:sm:min-h-0"
                onClick={() => setRetryNonce((n) => n + 1)}
              >
                {t.common.retry}
              </button>
            </div>
          ) : loading ? (
            <ul className="space-y-1.5" aria-busy="true">
              {Array.from({ length: Math.max(3, hits.length || 3) }).map((_, i) => (
                <li key={i} className="rounded-md border border-border bg-bg-elev/30 p-2">
                  <div className="flex gap-2">
                    <SkeletonBlock className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonBlock className="h-3 w-2/3" />
                      <SkeletonBlock className="h-2.5 w-full" />
                      <SkeletonBlock className="h-2.5 w-4/5" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              {libraryHits.length > 0 && (
                <section>
                  <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <Library className="h-3 w-3 text-accent" aria-hidden />
                    {t.textualSearch.libraryTitle}
                  </h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {libraryHits.map((h) => (
                      <li key={h.id}>
                        <Link
                          href={`/vn/${h.id}`}
                          className="group flex gap-2 rounded-md border border-border bg-bg-elev/30 p-2 transition-colors hover:border-accent"
                        >
                          <div className="w-10 shrink-0 overflow-hidden rounded border border-border bg-bg">
                            <SafeImage
                              src={h.image_thumb || h.image_url}
                              localSrc={h.local_image_thumb || h.local_image}
                              sexual={h.image_sexual}
                              alt={h.title}
                              className="aspect-[2/3] w-full"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-1 text-xs font-bold transition-colors can-hover:group-hover:text-accent">
                              {h.title}
                            </div>
                            {h.alttitle && h.alttitle !== h.title && (
                              <div className="line-clamp-1 text-[10px] text-muted">{h.alttitle}</div>
                            )}
                            <div className="mt-0.5 font-mono text-[9px] text-muted">{h.id}</div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {hits.length > 0 && (
                <section>
                  <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {t.textualSearch.title}
                  </h3>
                  <ul className="space-y-1.5">
              {hits.map((h, i) => {
                const Icon = ICONS[h.source];
                return (
                  <li key={`${h.vn_id}:${h.source}:${i}`}>
                    <Link
                      href={`/vn/${h.vn_id}`}
                      className="group flex gap-2 rounded-md border border-border bg-bg-elev/30 p-2 transition-colors hover:border-accent"
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="line-clamp-1 text-xs font-bold transition-colors can-hover:group-hover:text-accent">
                            {h.title}
                          </span>
                          <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted">
                            {t.textualSearch.source[h.source]}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] text-muted">{h.snippet}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
