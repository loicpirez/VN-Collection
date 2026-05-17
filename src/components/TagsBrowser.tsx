'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Search, Tags } from 'lucide-react';
import { RefreshPageButton } from './RefreshPageButton';
import { SkeletonRows } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import { stripVndbMarkup } from './VndbMarkup';
import type { VndbTag } from '@/lib/vndb-types';
import {
  groupTagsByCategory,
  tagChipHref,
  tagsPageHref,
  vndbTagExternalHref,
  type TagsPageMode,
} from '@/lib/tags-page-modes';

const CATEGORIES: { key: 'cont' | 'ero' | 'tech'; tkey: 'cat_cont' | 'cat_ero' | 'cat_tech' }[] = [
  { key: 'cont', tkey: 'cat_cont' },
  { key: 'ero', tkey: 'cat_ero' },
  { key: 'tech', tkey: 'cat_tech' },
];

interface TagsBrowserProps {
  lastUpdatedAt?: number | null;
  initialMode?: TagsPageMode;
}

/**
 * Two-mode tag browser:
 *
 * - `local`: pulls from `/api/collection/tags` (only tags present in
 *   the local collection). Clicking a card opens the canonical per-tag
 *   detail page. This is the default — the page paints instantly from
 *   SQLite.
 * - `vndb`:  pulls from `/api/tags` which proxies VNDB's `/tag`
 *   endpoint (cached via `cachedFetch` in `lib/vndb.ts`). Clicking a
 *   card goes to the per-tag detail page `/tag/<id>` which then
 *   exposes both Local and VNDB drill-downs.
 *
 * The mode lives in the URL (`?mode=vndb`) so the choice is shareable.
 */
export function TagsBrowser({ lastUpdatedAt = null, initialMode = 'local' }: TagsBrowserProps = {}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'' | 'cont' | 'ero' | 'tech'>('');
  const [mode, setMode] = useState<TagsPageMode>(initialMode);
  const [results, setResults] = useState<VndbTag[]>([]);
  const [localCounts, setLocalCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const isLocal = mode === 'local';
    const handle = setTimeout(async () => {
      try {
        const url = isLocal
          ? '/api/collection/tags'
          : (() => {
              const p = new URLSearchParams();
              if (q) p.set('q', q);
              if (category) p.set('category', category);
              p.set('results', '60');
              return `/api/tags?${p}`;
            })();
        const fetches: Promise<unknown>[] = [fetch(url, { signal: ctrl.signal })];
        if (!isLocal) fetches.push(fetch('/api/collection/tags', { signal: ctrl.signal }));
        const [mainRes, localRes] = await Promise.all(fetches) as [Response, Response | undefined];
        if (!mainRes.ok) throw new Error((await mainRes.json().catch(() => ({}))).error || t.common.error);
        const d = await mainRes.json();
        let list: VndbTag[] = d.tags;
        if (isLocal) {
          if (q.trim()) {
            const lower = q.trim().toLowerCase();
            list = list.filter((tag) => tag.name.toLowerCase().includes(lower));
          }
          if (category) list = list.filter((tag) => tag.category === category);
        } else if (localRes?.ok) {
          const ld = await localRes.json();
          const counts = new Map<string, number>();
          for (const t of (ld.tags as Array<{ id: string; vn_count: number }>) ?? []) {
            counts.set(t.id, t.vn_count);
          }
          if (alive) setLocalCounts(counts);
        }
        if (alive) setResults(list);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, isLocal ? 0 : 300);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, category, mode, t.common.error]);

  const switchMode = (next: TagsPageMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      const url = tagsPageHref(next);
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <Tags className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.tags.pageTitle}</h1>
          <p className="text-sm text-muted">
            {mode === 'vndb' ? t.tags.vndbTabHint : t.tags.pageSubtitle}
          </p>
        </div>
        <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
      </header>

      {/*
        The tab strip renders as `<Link>` so the URL contract
        (`/tags` for local, `/tags?mode=vndb` for VNDB) is the
        SOURCE of truth, not the local component state. Crawlers,
        the browser-QA script, and screen readers all see the
        href directly. The onClick handler still flips local state
        synchronously to avoid a full page reload, but the URL
        side-effect goes through router.replace via switchMode.
      */}
      <nav
        className="mb-4 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
        role="tablist"
      >
        <Link
          href={tagsPageHref('local')}
          role="tab"
          aria-selected={mode === 'local'}
          onClick={(e) => {
            e.preventDefault();
            switchMode('local');
          }}
          className={`rounded px-2.5 py-1 ${mode === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
        >
          {t.tags.tabLocal}
        </Link>
        <Link
          href={tagsPageHref('vndb')}
          role="tab"
          aria-selected={mode === 'vndb'}
          onClick={(e) => {
            e.preventDefault();
            switchMode('vndb');
          }}
          className={`rounded px-2.5 py-1 ${mode === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
        >
          {t.tags.tabVndb}
        </Link>
      </nav>

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
      </div>

      {error && <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">{error}</div>}

      {loading ? (
        <SkeletonRows count={8} withThumb={false} />
      ) : results.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.search.noResults}</div>
      ) : (
        <TagTreeView results={results} mode={mode} q={q} localCounts={localCounts} />
      )}
    </div>
  );
}

function TagTreeView({ results, mode, q, localCounts }: { results: VndbTag[]; mode: TagsPageMode; q: string; localCounts: Map<string, number> }) {
  const t = useT();
  // Memoised so typing into the search box doesn't recompute the
  // bucket map on every keystroke. The grouping is also where the
  // client-side `q` substring filter is applied (mirrors what the
  // local-mode useEffect already does so the two paths agree).
  const buckets = useMemo(() => groupTagsByCategory(results, q), [results, q]);
  return (
    <div className="space-y-6">
      {buckets.map((bucket) => {
        const label =
          bucket.category === 'other'
            ? t.tags.cat_other
            : t.tags[`cat_${bucket.category}` as 'cat_cont' | 'cat_ero' | 'cat_tech'];
        return (
          <section key={bucket.category}>
            <h2 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
              <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">{label}</span>
              <span className="text-muted/70">({bucket.tags.length})</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bucket.tags.map((tag) => (
                <article
                  key={tag.id}
                  className="group relative rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
                >
                  <Link
                    href={tagChipHref(mode, tag.id)}
                    className="block focus-visible:outline-none"
                    title={mode === 'vndb' ? t.tagPage.browse : t.tags.openInLibrary}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold transition-colors group-hover:text-accent">{tag.name}</h3>
                    </div>
                    {tag.description && (
                      <p className="mt-1 line-clamp-3 text-xs text-muted">
                        {stripVndbMarkup(tag.description)}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <span className="tabular-nums">{tag.vn_count.toLocaleString()} {t.tags.vnCount}</span>
                      {mode === 'vndb' && localCounts.get(tag.id) ? (
                        <span className="rounded bg-accent/15 px-1 py-0.5 text-accent tabular-nums">
                          {localCounts.get(tag.id)} {t.tags.inCollection}
                        </span>
                      ) : null}
                      {tag.aliases.length > 0 && <span className="truncate">· {tag.aliases.slice(0, 2).join(', ')}</span>}
                      <span className="ml-auto inline-flex items-center gap-1 text-accent transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        {mode === 'vndb' ? t.tagPage.browse : t.tags.openInLibrary}
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </span>
                    </div>
                  </Link>
                  <a
                    href={vndbTagExternalHref(tag.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-accent hover:text-accent"
                    aria-label={`VNDB ${tag.id}`}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden /> VNDB
                  </a>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
