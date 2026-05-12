'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, MessageSquareQuote, Quote } from 'lucide-react';
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
 * Free-text search across local-only fields: personal notes, the user's
 * custom synopsis override, and cached VN quotes. Surfaced inside the
 * Search page as a collapsible block — so a query that doesn't match a
 * VN title still has a chance to find a result from the user's own data.
 *
 * Debounces at 280ms to avoid flooding the API for every keystroke.
 */
export function TextualSearchPanel({ query }: { query: string }) {
  const t = useT();
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

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
    <section className="mb-6 rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        {t.textualSearch.title}
        {loading && <span className="text-[10px] font-normal">· {t.common.loading}</span>}
      </h3>
      <p className="mb-3 text-[11px] text-muted">{t.textualSearch.hint}</p>
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
    </section>
  );
}
