'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileText, MessageSquareQuote, Quote } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Hit {
  vn_id: string;
  title: string;
  source: 'notes' | 'custom_description' | 'quote';
  snippet: string;
}

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
 * which the user reported as hijacking the search experience.
 *
 * Collapsed-by-default: shows a single line with the hit count and
 * a chevron. Click to expand the rows. If there are no hits, the
 * component renders nothing.
 *
 * Debounces at 280ms to avoid flooding the API for every keystroke.
 */
export function TextualSearchPanel({ query }: { query: string }) {
  const t = useT();
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search/textual?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((d: { hits: Hit[] }) => { if (alive) setHits(d.hits); })
        .catch(() => undefined)
        .finally(() => { if (alive) setLoading(false); });
    }, 280);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  if (query.trim().length < 2) return null;
  if (!loading && hits.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-border bg-bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-bg-card"
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
            {t.textualSearch.title}
          </span>
          {loading ? (
            <span className="text-[10px] text-muted">· {t.common.loading}</span>
          ) : (
            <span className="rounded-full bg-bg-elev/50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted">
              {hits.length}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <p className="mb-2 text-[10px] text-muted/80">{t.textualSearch.hint}</p>
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
                        <span className="line-clamp-1 text-xs font-bold transition-colors group-hover:text-accent">
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
        </div>
      )}
    </section>
  );
}
