'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckSquare, Heart, KeyRound, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { VnCard } from './VnCard';
import { SkeletonCardGrid } from './Skeleton';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { useT } from '@/lib/i18n/client';

type WishlistSort = 'added_desc' | 'added_asc' | 'title' | 'rating_desc' | 'released_desc' | 'released_asc' | 'length_desc';
type WishlistGroup = 'none' | 'year' | 'developer' | 'language' | 'status';

const SORT_KEYS: WishlistSort[] = ['added_desc', 'added_asc', 'title', 'rating_desc', 'released_desc', 'released_asc', 'length_desc'];
const GROUP_KEYS: WishlistGroup[] = ['none', 'year', 'developer', 'language', 'status'];

interface WishlistItem {
  id: string;
  added: number;
  vote: number | null;
  notes: string | null;
  vn: {
    id: string;
    title: string;
    alttitle: string | null;
    released: string | null;
    rating: number | null;
    votecount: number | null;
    length_minutes: number | null;
    languages: string[];
    platforms: string[];
    image: { url: string; thumbnail: string; sexual?: number } | null;
    developers: { id: string; name: string }[];
    /**
     * Publisher data is not part of the `POST /ulist` payload (VNDB only
     * exposes producer roles at the release level). Wishlist cards
     * therefore render without a publisher chip — to surface publishers
     * the VN has to be added to the collection first, which triggers the
     * release walk in `fetchAndDownloadReleaseImages`.
     */
    publishers?: { id?: string; name: string }[];
  };
  in_collection: boolean;
  egs: { median: number | null; playtime_median_minutes: number | null } | null;
}

export function WishlistClient() {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Gate the empty-state copy so it never renders before the first successful
  // load. Initial-render flash of "Your wishlist is empty" was confusing the
  // user; we now wait for at least one resolved fetch.
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hideOwned, setHideOwned] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sort, setSort] = useState<WishlistSort>('added_desc');
  const [group, setGroup] = useState<WishlistGroup>('none');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch('/api/wishlist', { cache: 'no-store', signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = (await r.json()) as { needsAuth?: boolean; items: WishlistItem[] };
        if (signal?.aborted) return;
        if (d.needsAuth) {
          setNeedsAuth(true);
          setItems([]);
        } else {
          setNeedsAuth(false);
          setItems(d.items);
        }
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      }
    },
    [t.common.error],
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    load(ac.signal).finally(() => {
      if (ac.signal.aborted) return;
      setLoaded(true);
      setLoading(false);
    });
    return () => ac.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectMode(false);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const list = Array.from(selected);
    const ok = await confirm({
      message: t.wishlist.deleteConfirm.replace('{count}', String(list.length)),
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    let removed = 0;
    let failed = 0;
    for (const id of list) {
      try {
        const r = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
        if (r.ok) removed++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setItems((prev) => prev.filter((it) => !selected.has(it.vn.id)));
    clearSelection();
    setDeleting(false);
    if (failed > 0) toast.error(t.wishlist.deleteFailed.replace('{count}', String(failed)));
    if (removed > 0) toast.success(t.wishlist.deleteDone.replace('{count}', String(removed)));
  }

  const ownedCount = items.filter((it) => it.in_collection).length;

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return items.filter((it) => {
      if (hideOwned && it.in_collection) return false;
      if (!lower) return true;
      return (
        it.vn.title.toLowerCase().includes(lower) ||
        (it.vn.alttitle?.toLowerCase().includes(lower) ?? false) ||
        it.vn.developers.some((d) => d.name.toLowerCase().includes(lower))
      );
    });
  }, [items, q, hideOwned]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case 'added_desc': return (b.added ?? 0) - (a.added ?? 0);
        case 'added_asc': return (a.added ?? 0) - (b.added ?? 0);
        case 'title': return a.vn.title.localeCompare(b.vn.title);
        case 'rating_desc': return (b.vn.rating ?? 0) - (a.vn.rating ?? 0);
        case 'released_desc': return (b.vn.released ?? '').localeCompare(a.vn.released ?? '');
        case 'released_asc': return (a.vn.released ?? '').localeCompare(b.vn.released ?? '');
        case 'length_desc': return (b.vn.length_minutes ?? 0) - (a.vn.length_minutes ?? 0);
      }
    });
    return arr;
  }, [filtered, sort]);

  const grouped = useMemo<{ key: string; items: WishlistItem[] }[]>(() => {
    if (group === 'none') return [{ key: '', items: sorted }];
    const buckets = new Map<string, WishlistItem[]>();
    for (const it of sorted) {
      let key: string;
      switch (group) {
        case 'year': key = it.vn.released?.slice(0, 4) || t.wishlist.groupUnknown; break;
        case 'developer': key = it.vn.developers[0]?.name || t.wishlist.groupUnknown; break;
        case 'language': key = it.vn.languages[0]?.toUpperCase() || t.wishlist.groupUnknown; break;
        case 'status': key = it.in_collection ? t.wishlist.groupOwned : t.wishlist.groupTodo; break;
        default: key = '';
      }
      const list = buckets.get(key);
      if (list) list.push(it);
      else buckets.set(key, [it]);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => {
        if (group === 'year') return b.localeCompare(a);
        return a.localeCompare(b);
      })
      .map(([key, items]) => ({ key, items }));
  }, [sorted, group, t.wishlist.groupUnknown, t.wishlist.groupOwned, t.wishlist.groupTodo]);

  async function removeOne(id: string) {
    setRemovingId(id);
    try {
      const r = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      setItems((prev) => prev.filter((x) => x.vn.id !== id));
      toast.success(t.wishlist.removeOneDone);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Heart className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.wishlist.pageTitle}</h1>
          <p className="text-sm text-muted">{t.wishlist.pageSubtitle}</p>
        </div>
      </header>

      {needsAuth ? (
        <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          <KeyRound className="mb-2 h-5 w-5 text-accent" aria-hidden />
          <p className="mb-2">{t.wishlist.needsAuthTitle}</p>
          <p className="text-xs">
            {t.wishlist.needsAuthHint}{' '}
            <a
              href="https://vndb.org/u/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              vndb.org/u/tokens
            </a>
          </p>
        </div>
      ) : loading || !loaded ? (
        <SkeletonCardGrid count={18} />
      ) : error ? (
        <div className="rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mx-auto max-w-md py-12 text-center">
          <Heart className="mx-auto mb-4 h-12 w-12 text-muted" aria-hidden />
          <p className="mb-4 text-muted">{t.wishlist.empty}</p>
          <Link href="/search" className="btn btn-primary">
            <Search className="h-4 w-4" />
            {t.wishlist.emptyCta}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input pl-9"
                placeholder={t.wishlist.searchPlaceholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as WishlistSort)}
              className="input h-8 py-0 text-xs"
              title={t.wishlist.sortLabel}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t.wishlist.sortLabel}: {t.wishlist.sortOptions[k]}</option>
              ))}
            </select>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as WishlistGroup)}
              className="input h-8 py-0 text-xs"
              title={t.wishlist.groupLabel}
            >
              {GROUP_KEYS.map((k) => (
                <option key={k} value={k}>{t.wishlist.groupLabel}: {t.wishlist.groupOptions[k]}</option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={hideOwned}
                onChange={(e) => setHideOwned(e.target.checked)}
              />
              {t.wishlist.hideOwned}
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/50 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              title={t.wishlist.refresh}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {t.wishlist.refresh}
            </button>
            <button
              type="button"
              onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                selectMode
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-bg-elev/50 text-muted hover:border-accent hover:text-accent'
              }`}
              title={t.wishlist.selectMode}
            >
              <CheckSquare className="h-3 w-3" aria-hidden />
              {selectMode ? t.wishlist.exitSelect : t.wishlist.selectMode}
            </button>
            <span className="ml-auto text-xs text-muted">
              {t.wishlist.ownedSummary
                .replace('{owned}', String(ownedCount))
                .replace('{todo}', String(items.length - ownedCount))}
              {' · '}
              {filtered.length} / {items.length}
            </span>
          </div>

          {grouped.map((g) => (
            <section key={g.key || 'all'} className="mb-6">
              {g.key && (
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                  {g.key} <span className="ml-1 opacity-70">· {g.items.length}</span>
                </h2>
              )}
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {g.items.map((it) => (
                  <VnCard
                    key={it.id}
                    enableAdd
                    selectable={selectMode}
                    selected={selected.has(it.vn.id)}
                    onSelect={() => toggleSelected(it.vn.id)}
                    onAdded={(id) =>
                      setItems((prev) =>
                        prev.map((x) => (x.vn.id === id ? { ...x, in_collection: true } : x)),
                      )
                    }
                    onRemoveFromWishlist={
                      it.in_collection && removingId !== it.vn.id
                        ? () => removeOne(it.vn.id)
                        : undefined
                    }
                    data={{
                      id: it.vn.id,
                      title: it.vn.title,
                      alttitle: it.vn.alttitle,
                      poster: it.vn.image?.thumbnail || it.vn.image?.url || null,
                      sexual: it.vn.image?.sexual ?? null,
                      released: it.vn.released,
                      rating: it.vn.rating,
                      length_minutes: it.vn.length_minutes,
                      developers: it.vn.developers,
                      publishers: it.vn.publishers,
                      inCollectionBadge: it.in_collection,
                      egs_median: it.egs?.median ?? null,
                      egs_playtime_minutes: it.egs?.playtime_median_minutes ?? null,
                    }}
                  />
                ))}
              </div>
            </section>
          ))}

          {selectMode && selected.size > 0 && (
            <div className="fixed bottom-10 left-1/2 z-50 w-[min(96vw,32rem)] -translate-x-1/2 rounded-full border border-border bg-bg-card px-4 py-2 shadow-card sm:bottom-4">
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
                <span className="text-muted">{t.wishlist.selectedCount.replace('{count}', String(selected.size))}</span>
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 rounded-md bg-status-dropped px-3 py-1 text-xs font-bold text-bg disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {t.wishlist.deleteSelected}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-muted hover:text-white"
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
