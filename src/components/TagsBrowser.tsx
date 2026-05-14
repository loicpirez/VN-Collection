'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Library, Loader2, Search, Tags } from 'lucide-react';
import { RefreshPageButton } from './RefreshPageButton';
import { SkeletonRows } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import type { VndbTag } from '@/lib/vndb-types';

const CATEGORIES: { key: 'cont' | 'ero' | 'tech'; tkey: 'cat_cont' | 'cat_ero' | 'cat_tech' }[] = [
  { key: 'cont', tkey: 'cat_cont' },
  { key: 'ero', tkey: 'cat_ero' },
  { key: 'tech', tkey: 'cat_tech' },
];

export function TagsBrowser() {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'' | 'cont' | 'ero' | 'tech'>('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [results, setResults] = useState<VndbTag[]>([]);
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
          ? '/api/collection/tags'
          : (() => {
              const p = new URLSearchParams();
              if (q) p.set('q', q);
              if (category) p.set('category', category);
              p.set('results', '60');
              return `/api/tags?${p}`;
            })();
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = await r.json();
        let list: VndbTag[] = d.tags;
        if (onlyMine) {
          if (q.trim()) {
            const lower = q.trim().toLowerCase();
            list = list.filter((tag) => tag.name.toLowerCase().includes(lower));
          }
          if (category) list = list.filter((tag) => tag.category === category);
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
  }, [q, category, onlyMine, t.common.error]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <Tags className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.tags.pageTitle}</h1>
          <p className="text-sm text-muted">{t.tags.pageSubtitle}</p>
        </div>
        <RefreshPageButton />
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            placeholder={t.tags.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[220px]"
          value={category}
          onChange={(e) => setCategory(e.target.value as 'cont' | 'ero' | 'tech' | '')}
        >
          <option value="">{t.tags.categoryAll}</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{t.tags[c.tkey]}</option>
          ))}
        </select>
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
          {results.map((tag) => (
            <Link
              key={tag.id}
              href={`/?tag=${encodeURIComponent(tag.id)}`}
              className="group block rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
              title={t.tags.openInLibrary}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold transition-colors group-hover:text-accent">{tag.name}</h3>
                <span className="shrink-0 rounded-md bg-bg-elev px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                  {t.tags[`cat_${tag.category}` as 'cat_cont' | 'cat_ero' | 'cat_tech']}
                </span>
              </div>
              {tag.description && (
                <p className="mt-1 line-clamp-3 text-xs text-muted">
                  {stripBb(tag.description)}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                <span className="tabular-nums">{tag.vn_count.toLocaleString()} {t.tags.vnCount}</span>
                {tag.aliases.length > 0 && <span className="truncate">· {tag.aliases.slice(0, 2).join(', ')}</span>}
                <span className="ml-auto inline-flex items-center gap-1 text-accent transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  {t.tags.openInLibrary}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </span>
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
