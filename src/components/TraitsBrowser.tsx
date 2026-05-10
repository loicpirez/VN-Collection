'use client';
import { useEffect, useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { VndbTrait } from '@/lib/vndb-types';

export function TraitsBrowser() {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<VndbTrait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('results', '60');
        const r = await fetch(`/api/traits?${params}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = await r.json();
        if (alive) setResults(d.traits);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, t.common.error]);

  return (
    <div>
      <header className="mb-6 flex items-start gap-3">
        <Sparkles className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.traits.pageTitle}</h1>
          <p className="text-sm text-muted">{t.traits.pageSubtitle}</p>
        </div>
      </header>

      <div className="mb-6 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          className="input pl-9"
          placeholder={t.traits.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">{error}</div>}

      {loading ? (
        <div className="py-20 text-center text-muted"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />{t.common.loading}</div>
      ) : results.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.search.noResults}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((tr) => (
            <article
              key={tr.id}
              className="rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold">
                  {tr.group_name && <span className="text-muted">{tr.group_name} / </span>}
                  {tr.name}
                </h3>
                {tr.sexual && (
                  <span className="shrink-0 rounded-md bg-status-dropped/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-dropped">
                    R18
                  </span>
                )}
              </div>
              {tr.description && (
                <p className="mt-1 line-clamp-3 text-xs text-muted">{stripBb(tr.description)}</p>
              )}
              <div className="mt-2 text-[11px] text-muted tabular-nums">
                {tr.char_count.toLocaleString()} {t.traits.charCount}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function stripBb(s: string): string {
  return s.replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2').replace(/\[\/?[a-z]+\]/gi, '');
}
