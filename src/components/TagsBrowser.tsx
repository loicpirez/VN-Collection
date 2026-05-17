'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronRight, ExternalLink, Search, Tags } from 'lucide-react';
import { RefreshPageButton } from './RefreshPageButton';
import { SkeletonRows } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import { stripVndbMarkup } from './VndbMarkup';
import type { VndbTag } from '@/lib/vndb-types';
import type { VndbTagHomeTree, VndbTagTreeNode } from '@/lib/vndb-tag-web-parser';
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
  /** Pre-fetched scraped VNDB tag hierarchy from the server page.
   *  When provided, the initial render of VNDB mode skips the
   *  /api/tags/web-tree fetch and uses this data directly. */
  initialTree?: VndbTagHomeTree | null;
}

export function TagsBrowser({ lastUpdatedAt = null, initialMode = 'local', initialTree = null }: TagsBrowserProps = {}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'' | 'cont' | 'ero' | 'tech'>('');
  const [mode, setMode] = useState<TagsPageMode>(initialMode);
  const [results, setResults] = useState<VndbTag[]>([]);
  const [homeTree, setHomeTree] = useState<VndbTagHomeTree | null>(initialTree);
  const [localCounts, setLocalCounts] = useState<Map<string, number>>(new Map());
  // If the server pre-fetched the tree and we start in VNDB mode with no
  // search/filter active, we can render immediately without a skeleton.
  const [loading, setLoading] = useState(
    !(initialTree && initialMode === 'vndb'),
  );
  const [error, setError] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setStaleWarning(null);
    const ctrl = new AbortController();
    const isLocal = mode === 'local';
    const isVndbBrowse = !isLocal && !q.trim() && !category;

    // When the server pre-fetched the hierarchy (initialTree) and we're
    // in VNDB browse mode without a forced refresh, skip the web-tree
    // API call and re-use the SSR data.  We still need the local counts
    // from /api/collection/tags, so that fetch always fires.
    const skipTreeFetch = isVndbBrowse && !!initialTree && !refreshNonce;

    const handle = setTimeout(async () => {
      try {
        let list: VndbTag[] = [];
        let tree: VndbTagHomeTree | null = null;
        if (isLocal) {
          const res = await fetch('/api/collection/tags', { signal: ctrl.signal });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t.common.error);
          const d = await res.json();
          list = d.tags ?? [];
          if (q.trim()) {
            const lower = q.trim().toLowerCase();
            list = list.filter((tag) => tag.name.toLowerCase().includes(lower));
          }
          if (category) list = list.filter((tag) => tag.category === category);
        } else if (isVndbBrowse) {
          if (skipTreeFetch) {
            // Re-use SSR hierarchy — only fetch local counts.
            const localRes = await fetch('/api/collection/tags', { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { tags: [] });
            const counts = new Map<string, number>();
            for (const tag of (localRes.tags ?? []) as Array<{ id: string; vn_count: number }>) {
              counts.set(tag.id, tag.vn_count);
            }
            if (alive) setLocalCounts(counts);
            // Keep the existing homeTree (initialTree); do not overwrite.
            if (alive) {
              setResults([]);
              setLoading(false);
            }
            return;
          }
          const [treeRes, localRes] = await Promise.all([
            fetch(`/api/tags/web-tree${refreshNonce ? '?force=1' : ''}`, { signal: ctrl.signal }),
            fetch('/api/collection/tags', { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { tags: [] }),
          ]);
          const d = await treeRes.json().catch(() => ({}));
          if (!treeRes.ok) throw new Error(d.error || t.common.error);
          tree = d.data ?? null;
          const counts = new Map<string, number>();
          for (const tag of (localRes.tags ?? []) as Array<{ id: string; vn_count: number }>) {
            counts.set(tag.id, tag.vn_count);
          }
          if (alive) setLocalCounts(counts);
          if (alive && d.warning) setStaleWarning(String(d.warning));
        } else {
          const [tagRes, localRes] = await Promise.all([
            fetch(`/api/tags?results=100${category ? `&category=${category}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal: ctrl.signal }),
            fetch('/api/collection/tags', { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { tags: [] }),
          ]);
          const d = await tagRes.json().catch(() => ({}));
          if (!tagRes.ok) throw new Error(d.error || t.common.error);
          list = d.tags ?? [];
          const counts = new Map<string, number>();
          for (const tag of (localRes.tags ?? []) as Array<{ id: string; vn_count: number }>) {
            counts.set(tag.id, tag.vn_count);
          }
          if (alive) setLocalCounts(counts);
        }
        if (alive) {
          setResults(list);
          setHomeTree(tree);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, isLocal ? 0 : 300);
    return () => { alive = false; ctrl.abort(); clearTimeout(handle); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, mode, refreshNonce, t.common.error]);

  const switchMode = (next: TagsPageMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', tagsPageHref(next));
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
        {mode === 'vndb' && !q && !category && (
          <button type="button" className="btn" onClick={() => setRefreshNonce((n) => n + 1)}>
            {t.tags.refreshHierarchy}
          </button>
        )}
        <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
      </header>

      <nav className="mb-4 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs" role="tablist">
        <Link
          href={tagsPageHref('local')}
          role="tab"
          aria-selected={mode === 'local'}
          onClick={(e) => { e.preventDefault(); switchMode('local'); }}
          className={`rounded px-2.5 py-1 ${mode === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
        >
          {t.tags.tabLocal}
        </Link>
        <Link
          href={tagsPageHref('vndb')}
          role="tab"
          aria-selected={mode === 'vndb'}
          onClick={(e) => { e.preventDefault(); switchMode('vndb'); }}
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

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}
      {staleWarning && (
        <div className="mb-4 rounded-lg border border-status-playing bg-status-playing/10 p-4 text-sm text-status-playing">
          {t.tags.staleHierarchy}
        </div>
      )}

      {loading ? (
        mode === 'vndb' && !q && !category ? <VndbTreeSkeleton /> : <SkeletonRows count={12} withThumb={false} />
      ) : results.length === 0 ? (
        mode === 'vndb' && !q && !category && homeTree ? (
          <VndbTreeView tree={homeTree} localCounts={localCounts} />
        ) : (
          <div className="py-12 text-center text-muted">{t.search.noResults}</div>
        )
      ) : (
        <TagFlatView results={results} mode={mode} q={q} localCounts={localCounts} />
      )}
    </div>
  );
}

/** Tree view shown in VNDB mode with no active search/filter — parsed from https://vndb.org/g and cached locally. */
function VndbTreeView({ tree, localCounts }: { tree: VndbTagHomeTree; localCounts: Map<string, number> }) {
  const t = useT();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted">{t.tags.tagTree}</h2>
          <a
            href="https://vndb.org/g"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:text-white"
          >
            VNDB <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {tree.groups.map((group) => (
            <RootGroupRow
              key={group.id}
              label={group.label}
              href={group.href}
              children={group.children}
              moreCount={group.moreCount ?? null}
              localCounts={localCounts}
            />
          ))}
        </div>
      </section>

      {(tree.popular.length > 0 || tree.recentlyAdded.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tree.popular.length > 0 && (
            <TagListPanel title={t.tags.popularTags} tags={tree.popular} localCounts={localCounts} />
          )}
          {tree.recentlyAdded.length > 0 && (
            <TagListPanel title={t.tags.recentlyAdded} tags={tree.recentlyAdded} localCounts={localCounts} showDate />
          )}
        </div>
      )}
    </div>
  );
}

function RootGroupRow({
  label,
  href,
  children,
  moreCount,
  localCounts,
}: {
  label: string;
  href: string;
  children: VndbTagTreeNode[];
  moreCount: number | null;
  localCounts: Map<string, number>;
}) {
  const [open, setOpen] = useState(true);
  const t = useT();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-elev/35">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-elev/40 transition-colors"
      >
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          : <ChevronRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
        <span className="font-bold text-sm">{label}</span>
        <span className="text-xs text-muted">({children.length + (moreCount ?? 0)})</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {children.map((tag) => (
              <TreeTagChip key={tag.id} tag={tag} localCount={localCounts.get(tag.id)} />
            ))}
            {moreCount ? (
              <Link
                href={href}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {t.tags.moreTags.replace('{n}', String(moreCount))}
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeTagChip({ tag, localCount }: { tag: VndbTagTreeNode; localCount?: number }) {
  return (
    <Link
      href={tag.href}
      className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-card px-3 py-1 text-xs transition-colors hover:border-accent hover:bg-accent/10"
    >
      <span className="font-medium transition-colors group-hover:text-accent">{tag.name}</span>
      {tag.count != null ? <span className="text-muted tabular-nums">({tag.count.toLocaleString()})</span> : null}
      {localCount ? (
        <span className="rounded bg-accent/20 px-1 text-accent tabular-nums">{localCount}</span>
      ) : null}
    </Link>
  );
}

function TagListPanel({
  title,
  tags,
  localCounts,
  showDate = false,
}: {
  title: string;
  tags: Array<{ id: string; name: string; href: string; count?: number | null; dateLabel?: string | null }>;
  localCounts: Map<string, number>;
  showDate?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">{title}</h2>
      <ul className="space-y-2">
        {tags.slice(0, 12).map((tag) => (
          <li key={tag.id}>
            <Link href={tag.href} className="group flex items-center gap-2 rounded-lg border border-border bg-bg-elev/35 px-3 py-2 text-sm hover:border-accent">
              <span className="min-w-0 flex-1 truncate font-medium group-hover:text-accent">{tag.name}</span>
              {showDate && tag.dateLabel ? <span className="text-xs text-muted">{tag.dateLabel}</span> : null}
              {tag.count != null ? <span className="text-xs tabular-nums text-muted">({tag.count.toLocaleString()})</span> : null}
              {localCounts.get(tag.id) ? <span className="rounded bg-accent/20 px-1 text-xs text-accent">{localCounts.get(tag.id)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VndbTreeSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <SkeletonRows count={5} withThumb={false} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonRows count={6} withThumb={false} />
        <SkeletonRows count={6} withThumb={false} />
      </div>
    </div>
  );
}

/** Flat card grid — used when search/filter is active or in local mode */
function TagFlatView({ results, mode, q, localCounts }: { results: VndbTag[]; mode: TagsPageMode; q: string; localCounts: Map<string, number> }) {
  const t = useT();
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
                  >
                    <h3 className="text-sm font-bold transition-colors group-hover:text-accent">{tag.name}</h3>
                    {tag.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
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
                      <span className="ml-auto inline-flex items-center gap-1 text-accent transition-opacity md:opacity-0 md:group-hover:opacity-100">
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
