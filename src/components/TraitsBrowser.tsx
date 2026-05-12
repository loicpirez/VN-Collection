'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Library, Loader2, Search, Sparkles } from 'lucide-react';
import { SkeletonRows } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import type { VndbTrait } from '@/lib/vndb-types';

export function TraitsBrowser() {
  const t = useT();
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
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
        const url = onlyMine
          ? '/api/collection/traits'
          : `/api/traits?${new URLSearchParams({ q, results: '60' })}`;
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = await r.json();
        let list: VndbTrait[] = d.traits;
        if (onlyMine && q.trim()) {
          const lower = q.trim().toLowerCase();
          list = list.filter((tr) =>
            tr.name.toLowerCase().includes(lower) ||
            (tr.group_name?.toLowerCase().includes(lower) ?? false) ||
            tr.aliases.some((a) => a.toLowerCase().includes(lower)),
          );
        }
        if (alive) setResults(list);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, onlyMine ? 0 : 300);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, onlyMine, t.common.error]);

  return (
    <div>
      <header className="mb-6 flex items-start gap-3">
        <Sparkles className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.traits.pageTitle}</h1>
          <p className="text-sm text-muted">{t.traits.pageSubtitle}</p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            placeholder={t.traits.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyMine((v) => !v)}
          className={`btn ${onlyMine ? 'btn-primary' : ''}`}
          title={t.library.filterMineHint}
        >
          <Library className="h-4 w-4" />
          {t.library.filterMine}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">{error}</div>}

      {loading ? (
        <SkeletonRows count={8} withThumb={false} />
      ) : results.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.search.noResults}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((tr) => (
            <Link
              key={tr.id}
              href={`/trait/${encodeURIComponent(tr.id)}`}
              className="group block rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold transition-colors group-hover:text-accent">
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function stripBb(s: string): string {
  return s.replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2').replace(/\[\/?[a-z]+\]/gi, '');
}
