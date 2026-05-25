'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckSquare, Filter, Heart, KeyRound, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { SkeletonCardGrid } from './Skeleton';
import { CardDensitySlider, cardGridColumns } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { resolveScopedDensity, useDisplaySettings } from '@/lib/settings/client';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { platformLabel } from '@/lib/platform-label';
import { BulkDownloadButton } from './BulkDownloadButton';

import { readApiError } from '@/lib/api-error-read';
import { languageDisplayName } from '@/lib/language-names';
type WishlistSort = 'added_desc' | 'added_asc' | 'title' | 'rating_desc' | 'released_desc' | 'released_asc' | 'length_desc' | 'egs_rating_desc';
type WishlistGroup = 'none' | 'year' | 'developer' | 'language' | 'platform' | 'status';

const SORT_KEYS: WishlistSort[] = ['added_desc', 'added_asc', 'title', 'rating_desc', 'released_desc', 'released_asc', 'length_desc', 'egs_rating_desc'];
const GROUP_KEYS: WishlistGroup[] = ['none', 'year', 'developer', 'language', 'platform', 'status'];

const PREFS_STORAGE_KEY = 'wishlist_defaults_v1';

interface WishlistPrefs {
  sort: WishlistSort;
  group: WishlistGroup;
  hideOwned: boolean;
}

function loadPrefs(): WishlistPrefs {
  if (typeof window === 'undefined') {
    return { sort: 'added_desc', group: 'none', hideOwned: true };
  }
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { sort: 'added_desc', group: 'none', hideOwned: true };
    const parsed = JSON.parse(raw) as Partial<WishlistPrefs>;
    return {
      sort: SORT_KEYS.includes(parsed.sort as WishlistSort) ? (parsed.sort as WishlistSort) : 'added_desc',
      group: GROUP_KEYS.includes(parsed.group as WishlistGroup) ? (parsed.group as WishlistGroup) : 'none',
      hideOwned: typeof parsed.hideOwned === 'boolean' ? parsed.hideOwned : true,
    };
  } catch {
    return { sort: 'added_desc', group: 'none', hideOwned: true };
  }
}

function persistPrefs(prefs: WishlistPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be full / unavailable; swallow.
  }
}

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

// Same WeakMap-cached projection trick as `LibraryClient`'s `toCardData`
// — keeps `React.memo(VnCard)` from re-rendering every wishlist card
// whenever a sibling state (search query, sort change) ticks.
const wishlistCache = new WeakMap<WishlistItem, CardData>();

/**
 * R5-137: stable-callback wrapper for `VnCard` inside the wishlist
 * grid. Mirrors the `MemoCard` pattern in `LibraryClient` — the
 * outer component passes stable `onSelect(id)` / `onAdded(id)` /
 * `onRemove(id)` callbacks, and this wrapper creates the per-card
 * arrow inside its own `useCallback` so sibling state ticks (search
 * input, sort change) don't re-render every card.
 */
const MemoWishlistCard = memo(function MemoWishlistCard({
  id,
  data,
  selectable,
  selected,
  canRemove,
  onSelect,
  onAdded,
  onRemove,
}: {
  id: string;
  data: CardData;
  selectable: boolean;
  selected: boolean;
  canRemove: boolean;
  onSelect: (id: string) => void;
  onAdded: (id: string) => void;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const handleSelect = useCallback(() => onSelect(id), [onSelect, id]);
  const handleRemove = useCallback(() => onRemove(id), [onRemove, id]);
  return (
    <VnCard
      enableAdd
      selectable={selectable}
      selected={selected}
      onSelect={handleSelect}
      onAdded={onAdded}
      onRemoveFromWishlist={canRemove ? handleRemove : undefined}
      data={data}
    />
  );
});

function wishlistCardData(it: WishlistItem): CardData {
  const cached = wishlistCache.get(it);
  if (cached) return cached;
  const data: CardData = {
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
  };
  wishlistCache.set(it, data);
  return data;
}

export function WishlistClient() {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { settings } = useDisplaySettings();
  // Resolve the active density for the wishlist scope; the
  // `?density=N` override still wins thanks to `resolveScopedDensity`.
  const search = useSearchParams();
  const density = resolveScopedDensity(settings, 'wishlist', search?.get('density') ?? null);
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
  const [filterLang, setFilterLang] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterRatingMin, setFilterRatingMin] = useState('');
  const [filterRatingMax, setFilterRatingMax] = useState('');
  const [filterYearMin, setFilterYearMin] = useState('');
  const [filterYearMax, setFilterYearMax] = useState('');
  // Seed `hideOwned`, `sort`, and `group` from localStorage so the
  // user's preferred view is restored on every visit (audit/QA #13:
  // wishlist prefs should auto-save like the rest of the app). The
  // initialiser runs once on mount; subsequent setX calls below
  // mirror to storage via the useEffect at the bottom of this hook
  // chain.
  const [hideOwned, setHideOwned] = useState<boolean>(() => loadPrefs().hideOwned);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sort, setSort] = useState<WishlistSort>(() => loadPrefs().sort);
  const [group, setGroup] = useState<WishlistGroup>(() => loadPrefs().group);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Mirror durable prefs (sort, group, hideOwned) to localStorage on
  // every change. `q`, `selectMode`, and `selected` stay session-only
  // because they're transient search / multi-select state, not
  // preferences.
  useEffect(() => {
    persistPrefs({ sort, group, hideOwned });
  }, [sort, group, hideOwned]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch('/api/wishlist', { cache: 'no-store', signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
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

  // R5-137: every per-card callback flows through a stable
  // `useCallback` + functional `setState` so `React.memo(VnCard)`
  // (and the local `MemoWishlistCard` wrapper below) can skip
  // re-renders driven by sibling state changes (search query,
  // sort, group). Functional updaters mean no dep on `items` /
  // `selected`, so the callback identity stays the same across
  // renders.
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);

  // R5-137: `handleAdded` is a single allocation per WishlistClient
  // instance; passing it to every card replaces the old
  // `onAdded={(id) => setItems(…)}` arrow that was re-created on
  // every render and defeated React.memo on VnCard.
  const handleAdded = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.vn.id === id ? { ...x, in_collection: true } : x)),
    );
  }, []);

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

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const it of items) for (const l of it.vn.languages) langs.add(l);
    return Array.from(langs).sort();
  }, [items]);

  const availablePlatforms = useMemo(() => {
    const plats = new Set<string>();
    for (const it of items) for (const p of it.vn.platforms) plats.add(p);
    return Array.from(plats).sort();
  }, [items]);

  const activeFilterCount =
    (filterLang ? 1 : 0) +
    (filterPlatform ? 1 : 0) +
    (filterRatingMin ? 1 : 0) +
    (filterRatingMax ? 1 : 0) +
    (filterYearMin ? 1 : 0) +
    (filterYearMax ? 1 : 0);

  function resetFilters() {
    setFilterLang('');
    setFilterPlatform('');
    setFilterRatingMin('');
    setFilterRatingMax('');
    setFilterYearMin('');
    setFilterYearMax('');
  }

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    const rMin = filterRatingMin ? Number(filterRatingMin) : null;
    const rMax = filterRatingMax ? Number(filterRatingMax) : null;
    const yMin = filterYearMin || null;
    const yMax = filterYearMax || null;
    return items.filter((it) => {
      if (hideOwned && it.in_collection) return false;
      if (filterLang && !it.vn.languages.includes(filterLang)) return false;
      if (filterPlatform && !it.vn.platforms.includes(filterPlatform)) return false;
      if (rMin !== null && (it.vn.rating == null || it.vn.rating < rMin)) return false;
      if (rMax !== null && (it.vn.rating == null || it.vn.rating > rMax)) return false;
      if (yMin && (!it.vn.released || it.vn.released.slice(0, 4) < yMin)) return false;
      if (yMax && (!it.vn.released || it.vn.released.slice(0, 4) > yMax)) return false;
      if (!lower) return true;
      return (
        it.vn.title.toLowerCase().includes(lower) ||
        (it.vn.alttitle?.toLowerCase().includes(lower) ?? false) ||
        it.vn.developers.some((d) => d.name.toLowerCase().includes(lower))
      );
    });
  }, [items, q, hideOwned, filterLang, filterPlatform, filterRatingMin, filterRatingMax, filterYearMin, filterYearMax]);
  const downloadItems = useMemo(
    () => filtered.map((it) => ({ id: it.vn.id, title: it.vn.title })),
    [filtered],
  );

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
        case 'egs_rating_desc': return (b.egs?.median ?? 0) - (a.egs?.median ?? 0);
        default: {
          const _exhaustive: never = sort;
          return String(_exhaustive).localeCompare('');
        }
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
        case 'language': key = it.vn.languages[0] ? languageDisplayName(it.vn.languages[0]) : t.wishlist.groupUnknown; break;
        case 'platform': key = it.vn.platforms[0] ? platformLabel(it.vn.platforms[0]) : t.wishlist.groupUnknown; break;
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

  // R5-137: `removeOne` is a stable `useCallback` so the
  // `onRemoveFromWishlist` arrow rendered per card can read it
  // without changing identity each render. `t.*` strings are
  // stable per locale (the dictionary is the same object), so
  // deps don't churn between cards. `removingId` is intentionally
  // omitted from deps — we read the latest value via a ref so a
  // tap on card B while card A is still removing doesn't get
  // blocked by a stale closure capture.
  const removingIdRef = useRef(removingId);
  removingIdRef.current = removingId;
  const removeOne = useCallback(
    async (id: string) => {
      setRemovingId(id);
      try {
        const r = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        setItems((prev) => prev.filter((x) => x.vn.id !== id));
        toast.success(t.wishlist.removeOneDone);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setRemovingId(null);
      }
    },
    [t.common.error, t.wishlist.removeOneDone, toast],
  );

  return (
    <DensityScopeProvider scope="wishlist">
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input pl-9"
                placeholder={t.wishlist.searchPlaceholder}
                aria-label={t.wishlist.searchPlaceholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as WishlistSort)}
              className="input h-8 py-0 text-xs"
              title={t.wishlist.sortLabel}
              aria-label={t.wishlist.sortLabel}
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
              aria-label={t.wishlist.groupLabel}
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
            <CardDensitySlider scope="wishlist" />
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
            <BulkDownloadButton itemsOverride={downloadItems} label={t.wishlist.downloadVisible} />
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

          {/* Advanced filters panel */}
          <div className="mb-4 rounded-lg border border-border bg-bg-elev/20 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <Filter className="h-3 w-3" aria-hidden />
                {t.wishlist.filterLabel}
                {activeFilterCount > 0 && (
                  <span className="rounded bg-accent/20 px-1 text-accent">
                    {t.wishlist.filterActiveCount.replace('{n}', String(activeFilterCount))}
                  </span>
                )}
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-status-dropped"
                >
                  <X className="h-3 w-3" aria-hidden />
                  {t.wishlist.filterReset}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.length > 0 && (
                <select
                  value={filterLang}
                  onChange={(e) => setFilterLang(e.target.value)}
                  className="input h-7 py-0 text-xs"
                  aria-label={t.wishlist.filterByLanguage}
                >
                  <option value="">{t.wishlist.filterByLanguage}</option>
                  {availableLanguages.map((l) => (
                    <option key={l} value={l}>{languageDisplayName(l)}</option>
                  ))}
                </select>
              )}
              {availablePlatforms.length > 0 && (
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="input h-7 py-0 text-xs"
                  aria-label={t.wishlist.filterByPlatform}
                >
                  <option value="">{t.wishlist.filterByPlatform}</option>
                  {availablePlatforms.map((p) => (
                    <option key={p} value={p}>{platformLabel(p)}</option>
                  ))}
                </select>
              )}
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input h-7 w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterRatingMin}
                  value={filterRatingMin}
                  min={0}
                  max={100}
                  onChange={(e) => setFilterRatingMin(e.target.value)}
                  aria-label={t.wishlist.filterRatingMin}
                />
                <span className="text-xs text-muted">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input h-7 w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterRatingMax}
                  value={filterRatingMax}
                  min={0}
                  max={100}
                  onChange={(e) => setFilterRatingMax(e.target.value)}
                  aria-label={t.wishlist.filterRatingMax}
                />
              </div>
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input h-7 w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterYearMin}
                  value={filterYearMin}
                  min={1980}
                  max={2040}
                  onChange={(e) => setFilterYearMin(e.target.value)}
                  aria-label={t.wishlist.filterYearMin}
                />
                <span className="text-xs text-muted">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input h-7 w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterYearMax}
                  value={filterYearMax}
                  min={1980}
                  max={2040}
                  onChange={(e) => setFilterYearMax(e.target.value)}
                  aria-label={t.wishlist.filterYearMax}
                />
              </div>
            </div>
          </div>

          {grouped.map((g) => (
            <section key={g.key || 'all'} className="mb-6">
              {g.key && (
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                  {g.key} <span className="ml-1 opacity-70">· {g.items.length}</span>
                </h2>
              )}
              <div
                className="grid gap-5"
                style={{ gridTemplateColumns: cardGridColumns(density) }}
              >
                {g.items.map((it) => (
                  <MemoWishlistCard
                    key={it.id}
                    id={it.vn.id}
                    data={wishlistCardData(it)}
                    selectable={selectMode}
                    selected={selected.has(it.vn.id)}
                    canRemove={it.in_collection && removingId !== it.vn.id}
                    onSelect={toggleSelected}
                    onAdded={handleAdded}
                    onRemove={removeOne}
                  />
                ))}
              </div>
            </section>
          ))}

          {selectMode && selected.size > 0 && (
            <div
              className="fixed bottom-10 left-1/2 z-50 w-[min(96vw,32rem)] -translate-x-1/2 rounded-full border border-border bg-bg-card px-4 py-2 shadow-card sm:bottom-4"
              style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
                <span className="text-muted">{t.wishlist.selectedCount.replace('{count}', String(selected.size))}</span>
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deleting}
                  className="btn btn-danger btn-xs"
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
    </DensityScopeProvider>
  );
}
