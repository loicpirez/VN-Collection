'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckSquare, ChevronLeft, ChevronRight, Filter, Heart, KeyRound, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { SkeletonCardGrid } from './Skeleton';
import { CardDensitySlider, cardGridColumns } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { resolveScopedDensity, useDisplaySettings } from '@/lib/settings/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useT } from '@/lib/i18n/client';
import { platformLabel } from '@/lib/platform-label';
import { BulkDownloadButton } from './BulkDownloadButton';

import { readApiError } from '@/lib/api-error-read';
import { languageDisplayName } from '@/lib/language-names';
import { BCP47, yearOnly } from '@/lib/locale-number';
import { decodeWishlistClientState, type WishlistClientItem } from '@/lib/vndb-ui-client-shape';

type WishlistSort = 'added_desc' | 'added_asc' | 'title' | 'rating_desc' | 'released_desc' | 'released_asc' | 'length_desc' | 'egs_rating_desc';
type WishlistGroup = 'none' | 'year' | 'developer' | 'language' | 'platform' | 'status';

const WISHLIST_SORTS: ReadonlySet<WishlistSort> = new Set<WishlistSort>([
  'added_desc', 'added_asc', 'title', 'rating_desc',
  'released_desc', 'released_asc', 'length_desc', 'egs_rating_desc',
]);
const WISHLIST_GROUPS: ReadonlySet<WishlistGroup> = new Set<WishlistGroup>([
  'none', 'year', 'developer', 'language', 'platform', 'status',
]);

function readSortFromUrl(value: string | null, fallback: WishlistSort): WishlistSort {
  return value && WISHLIST_SORTS.has(value as WishlistSort) ? (value as WishlistSort) : fallback;
}
function readGroupFromUrl(value: string | null, fallback: WishlistGroup): WishlistGroup {
  return value && WISHLIST_GROUPS.has(value as WishlistGroup) ? (value as WishlistGroup) : fallback;
}

const SORT_KEYS: WishlistSort[] = ['added_desc', 'added_asc', 'title', 'rating_desc', 'released_desc', 'released_asc', 'length_desc', 'egs_rating_desc'];
const GROUP_KEYS: WishlistGroup[] = ['none', 'year', 'developer', 'language', 'platform', 'status'];

const Q_DEBOUNCE_MS = 300;
const WISHLIST_PAGE_SIZE = 60;

function readPageFromUrl(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function selectionKey(values: Iterable<string>): string {
  return Array.from(values).sort().join('|');
}

// Same WeakMap-cached projection trick as `LibraryClient`'s `toCardData`
// - keeps `React.memo(VnCard)` from re-rendering every wishlist card
// whenever a sibling state (search query, sort change) ticks.
const wishlistCache = new WeakMap<WishlistClientItem, CardData>();

/**
 * R5-137: stable-callback wrapper for `VnCard` inside the wishlist
 * grid. Mirrors the `MemoCard` pattern in `LibraryClient` - the
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
  removing,
  onSelect,
  onAdded,
  onRemove,
}: {
  id: string;
  data: CardData;
  selectable: boolean;
  selected: boolean;
  removing: boolean;
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
      onRemoveFromWishlist={selectable ? undefined : handleRemove}
      removingFromWishlist={removing}
      data={data}
    />
  );
});

const WishlistSearchInput = memo(function WishlistSearchInput({
  urlValue,
  placeholder,
  onCommit,
  debounceMs,
}: {
  urlValue: string;
  placeholder: string;
  onCommit: (next: string) => void;
  debounceMs: number;
}) {
  const [draft, setDraft] = useState(urlValue);
  useEffect(() => {
    setDraft(urlValue);
  }, [urlValue]);
  useEffect(() => {
    if (draft === urlValue) return;
    const handle = setTimeout(() => onCommit(draft.trim()), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, urlValue, onCommit, debounceMs]);
  return (
    <div className="relative flex-1 min-w-[160px] sm:min-w-[200px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        inputMode="search"
        className="input pl-9"
        placeholder={placeholder}
        aria-label={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
});

function wishlistCardData(it: WishlistClientItem): CardData {
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
    inCollectionBadge: it.in_collection,
    egs_median: it.egs?.median ?? null,
    egs_playtime_minutes: it.egs?.playtime_median_minutes ?? null,
  };
  wishlistCache.set(it, data);
  return data;
}

export function WishlistClient() {
  const t = useT();
  const locale = useLocale();
  const collator = useMemo(() => new Intl.Collator(BCP47[locale], { sensitivity: 'base', numeric: true }), [locale]);
  const toast = useToast();
  const { confirm } = useConfirm();
  const { settings } = useDisplaySettings();
  // Resolve the active density for the wishlist scope; the
  // `?density=N` override still wins thanks to `resolveScopedDensity`.
  const search = useSearchParams();
  const router = useRouter();
  const density = resolveScopedDensity(settings, 'wishlist', search?.get('density') ?? null);
  const wishlistGridStyle: React.CSSProperties = useMemo(
    () => ({ gridTemplateColumns: cardGridColumns(density) }),
    [density],
  );

  const replaceParams = useCallback(
    (mutator: (sp: URLSearchParams) => void) => {
      const next = new URLSearchParams(search?.toString() ?? '');
      mutator(next);
      const qs = next.toString();
      router.replace(qs ? `/wishlist?${qs}` : '/wishlist', { scroll: false });
    },
    [router, search],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      replaceParams((sp) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
        if (key !== 'page') sp.delete('page');
      });
    },
    [replaceParams],
  );

  const commitSearch = useCallback(
    (next: string) => setParam('q', next || null),
    [setParam],
  );

  const q = search?.get('q') ?? '';
  const filterLang = search?.get('lang') ?? '';
  const filterPlatform = search?.get('platform') ?? '';
  const filterRatingMin = search?.get('ratingMin') ?? '';
  const filterRatingMax = search?.get('ratingMax') ?? '';
  const filterYearMin = search?.get('yearMin') ?? '';
  const filterYearMax = search?.get('yearMax') ?? '';
  const urlSort = search?.get('sort') ?? null;
  const urlGroup = search?.get('group') ?? null;
  const urlHideOwned = search?.get('hideOwned');
  const requestedPage = readPageFromUrl(search?.get('page') ?? null);
  const sort = readSortFromUrl(urlSort, 'added_desc');
  const group = readGroupFromUrl(urlGroup, 'none');
  const hideOwned = urlHideOwned != null ? urlHideOwned !== '0' : true;

  const [items, setItems] = useState<WishlistClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Gate the empty-state copy so it never renders before the first successful
  // load. Initial-render flash of "Your wishlist is empty" was confusing the
  // user; we now wait for at least one resolved fetch.
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingMinInput, setRatingMinInput] = useState(filterRatingMin);
  const [ratingMaxInput, setRatingMaxInput] = useState(filterRatingMax);
  const [yearMinInput, setYearMinInput] = useState(filterYearMin);
  const [yearMaxInput, setYearMaxInput] = useState(filterYearMax);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const manualRefreshIdRef = useRef(0);
  const mountedRef = useRef(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const removingIdRef = useRef(removingId);
  removingIdRef.current = removingId;
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    setRatingMinInput(filterRatingMin);
    setRatingMaxInput(filterRatingMax);
  }, [filterRatingMin, filterRatingMax]);
  useEffect(() => {
    setYearMinInput(filterYearMin);
    setYearMaxInput(filterYearMax);
  }, [filterYearMin, filterYearMax]);

  const load = useCallback(
    async (showLoading = false) => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      if (showLoading) setLoading(true);
      try {
        const r = await fetch('/api/wishlist', { cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const d = decodeWishlistClientState(await r.json());
        if (!d) throw new Error(t.common.error);
        if (controller.signal.aborted || loadAbortRef.current !== controller) return;
        if (d.needsAuth) {
          setNeedsAuth(true);
          setItems([]);
        } else {
          setNeedsAuth(false);
          setItems(d.items);
        }
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || controller.signal.aborted || loadAbortRef.current !== controller) return;
        setError((e as Error).message);
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          setLoaded(true);
          if (showLoading) setLoading(false);
        }
      }
    },
    [t.common.error],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load(true);
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    const refreshId = manualRefreshIdRef.current + 1;
    manualRefreshIdRef.current = refreshId;
    setRefreshing(true);
    await load();
    if (mountedRef.current && manualRefreshIdRef.current === refreshId) setRefreshing(false);
  }, [load]);

  const toggleSelected = useCallback((id: string) => {
    if (mutationInFlightRef.current) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedRef.current = next;
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    const next = new Set<string>();
    selectedRef.current = next;
    setSelected(next);
    setSelectMode(false);
  }, []);

  const handleAdded = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.vn.id === id ? { ...x, in_collection: true } : x)),
    );
  }, []);

  async function deleteSelected() {
    if (mutationInFlightRef.current) return;
    const list = Array.from(selectedRef.current);
    if (list.length === 0) return;
    const ownerSelectionKey = selectionKey(list);
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    loadAbortRef.current?.abort();
    setDeleting(true);
    const ok = await confirm({
      message: t.wishlist.deleteConfirm.replace('{count}', String(list.length)),
      tone: 'danger',
    });
    if (
      !ok
      || !mountedRef.current
      || mutationAbortRef.current !== controller
      || controller.signal.aborted
      || selectionKey(selectedRef.current) !== ownerSelectionKey
    ) {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        if (mountedRef.current) setDeleting(false);
      }
      return;
    }
    try {
      let removed = 0;
      let failed = 0;
      const results = await Promise.all(
        list.map(async (id) => {
          try {
            const r = await fetch(`/api/wishlist/${id}`, { method: 'DELETE', signal: controller.signal });
            return { id, ok: r.ok };
          } catch (e) {
            if ((e as Error).name !== 'AbortError') console.error(`[WishlistClient] delete failed for ${id}:`, e);
            return { id, ok: false };
          }
        }),
      );
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      const removedIds = new Set<string>();
      for (const outcome of results) {
        if (outcome.ok) {
          removed++;
          removedIds.add(outcome.id);
        }
        else failed++;
      }
      setItems((prev) => prev.filter((it) => !removedIds.has(it.vn.id)));
      clearSelection();
      if (failed > 0) toast.error(t.wishlist.deleteFailed.replace('{count}', String(failed)));
      if (removed > 0) toast.success(t.wishlist.deleteDone.replace('{count}', String(removed)));
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        if (mountedRef.current) setDeleting(false);
      }
    }
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
    setRatingMinInput('');
    setRatingMaxInput('');
    setYearMinInput('');
    setYearMaxInput('');
    replaceParams((sp) => {
      sp.delete('lang');
      sp.delete('platform');
      sp.delete('ratingMin');
      sp.delete('ratingMax');
      sp.delete('yearMin');
      sp.delete('yearMax');
      sp.delete('page');
    });
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
      if (yMin || yMax) {
        const yr = yearOnly(it.vn.released);
        if (!yr) return false;
        if (yMin && yr < yMin) return false;
        if (yMax && yr > yMax) return false;
      }
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
        case 'title': return collator.compare(a.vn.title, b.vn.title);
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
  }, [filtered, sort, collator]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / WISHLIST_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageStart = (page - 1) * WISHLIST_PAGE_SIZE;
  const pageItems = useMemo(
    () => sorted.slice(pageStart, pageStart + WISHLIST_PAGE_SIZE),
    [pageStart, sorted],
  );

  const grouped = useMemo<{ key: string; items: WishlistClientItem[] }[]>(() => {
    if (group === 'none') return [{ key: '', items: pageItems }];
    const buckets = new Map<string, WishlistClientItem[]>();
    for (const it of pageItems) {
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
        if (group === 'year') return collator.compare(b, a);
        return collator.compare(a, b);
      })
      .map(([key, items]) => ({ key, items }));
  }, [pageItems, group, t.wishlist.groupUnknown, t.wishlist.groupOwned, t.wishlist.groupTodo, collator]);

  const removeOne = useCallback(
    async (id: string) => {
      if (!mountedRef.current || mutationInFlightRef.current) return;
      const controller = new AbortController();
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = controller;
      mutationInFlightRef.current = true;
      removingIdRef.current = id;
      loadAbortRef.current?.abort();
      setRemovingId(id);
      try {
        const r = await fetch(`/api/wishlist/${id}`, { method: 'DELETE', signal: controller.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        setItems((prev) => prev.filter((x) => x.vn.id !== id));
        toast.success(t.wishlist.removeOneDone);
      } catch (e) {
        if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        toast.error((e as Error).message);
      } finally {
        if (mutationAbortRef.current === controller) {
          mutationAbortRef.current = null;
          mutationInFlightRef.current = false;
          removingIdRef.current = null;
          if (mountedRef.current) setRemovingId(null);
        }
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
        <div role="alert" className="rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mx-auto max-w-md py-12 text-center">
          <Heart className="mx-auto mb-4 h-12 w-12 text-muted" aria-hidden />
          <p className="mb-4 text-muted">{t.wishlist.empty}</p>
          <Link href="/search" className="btn btn-primary">
            <Search className="h-4 w-4" aria-hidden />
            {t.wishlist.emptyCta}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <WishlistSearchInput
              urlValue={q}
              placeholder={t.wishlist.searchPlaceholder}
              onCommit={commitSearch}
              debounceMs={Q_DEBOUNCE_MS}
            />
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value === 'added_desc' ? null : e.target.value)}
              className="input min-h-[44px] py-0 text-xs"
              title={t.wishlist.sortLabel}
              aria-label={t.wishlist.sortLabel}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t.wishlist.sortLabel}: {t.wishlist.sortOptions[k]}</option>
              ))}
            </select>
            <select
              value={group}
              onChange={(e) => setParam('group', e.target.value === 'none' ? null : e.target.value)}
              className="input min-h-[44px] py-0 text-xs"
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
                onChange={(e) => setParam('hideOwned', e.target.checked ? null : '0')}
              />
              {t.wishlist.hideOwned}
            </label>
            <CardDensitySlider scope="wishlist" />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || deleting || removingId !== null}
              className="btn"
              title={t.wishlist.refresh}
              aria-label={t.wishlist.refresh}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {t.wishlist.refresh}
            </button>
            <BulkDownloadButton itemsOverride={downloadItems} label={t.wishlist.downloadVisible} />
            <button
              type="button"
              onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
              disabled={deleting}
              className={`btn btn-xs ${selectMode ? 'btn-primary' : ''}`}
              title={t.wishlist.selectMode}
            >
              <CheckSquare className="h-3 w-3" aria-hidden />
              {selectMode ? t.wishlist.exitSelect : t.wishlist.selectMode}
            </button>
            <span className="ml-auto text-xs text-muted">
              {t.wishlist.ownedSummary
                .replace('{owned}', String(ownedCount))
                .replace('{todo}', String(items.length - ownedCount))}
              {' / '}
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableLanguages.length > 0 && (
                <select
                  value={filterLang}
                  onChange={(e) => setParam('lang', e.target.value || null)}
                  className="input min-h-[44px] py-0 text-xs"
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
                  onChange={(e) => setParam('platform', e.target.value || null)}
                  className="input min-h-[44px] py-0 text-xs"
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
                  className="input min-h-[44px] w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterRatingMin}
                  value={ratingMinInput}
                  min={0}
                  max={100}
                  onChange={(e) => setRatingMinInput(e.target.value)}
                  onBlur={() => setParam('ratingMin', ratingMinInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('ratingMin', ratingMinInput.trim() || null);
                  }}
                  aria-label={t.wishlist.filterRatingMin}
                />
                <span className="text-xs text-muted">-</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input min-h-[44px] w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterRatingMax}
                  value={ratingMaxInput}
                  min={0}
                  max={100}
                  onChange={(e) => setRatingMaxInput(e.target.value)}
                  onBlur={() => setParam('ratingMax', ratingMaxInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('ratingMax', ratingMaxInput.trim() || null);
                  }}
                  aria-label={t.wishlist.filterRatingMax}
                />
              </div>
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input min-h-[44px] w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterYearMin}
                  value={yearMinInput}
                  min={1980}
                  max={2040}
                  onChange={(e) => setYearMinInput(e.target.value)}
                  onBlur={() => setParam('yearMin', yearMinInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('yearMin', yearMinInput.trim() || null);
                  }}
                  aria-label={t.wishlist.filterYearMin}
                />
                <span className="text-xs text-muted">-</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input min-h-[44px] w-20 py-0 text-xs"
                  placeholder={t.wishlist.filterYearMax}
                  value={yearMaxInput}
                  min={1980}
                  max={2040}
                  onChange={(e) => setYearMaxInput(e.target.value)}
                  onBlur={() => setParam('yearMax', yearMaxInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('yearMax', yearMaxInput.trim() || null);
                  }}
                  aria-label={t.wishlist.filterYearMax}
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t.wishlist.filterEmpty}</p>
          ) : (
            grouped.map((g) => (
              <section key={g.key || 'all'} className="mb-6">
                {g.key && (
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                    {g.key} <span className="ml-1 opacity-70">/ {g.items.length}</span>
                  </h2>
                )}
                <div
                  className="grid gap-3"
                  style={wishlistGridStyle}
                >
                  {g.items.map((it) => (
                    <MemoWishlistCard
                      key={it.id}
                      id={it.vn.id}
                      data={wishlistCardData(it)}
                      selectable={selectMode}
                      selected={selected.has(it.vn.id)}
                      removing={removingId === it.vn.id}
                      onSelect={toggleSelected}
                      onAdded={handleAdded}
                      onRemove={removeOne}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {totalPages > 1 && (
            <nav
              className="mb-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4"
              aria-label={t.wishlist.paginationLabel}
            >
              <button
                type="button"
                className="btn min-h-[44px]"
                disabled={page <= 1}
                onClick={() => setParam('page', page > 2 ? String(page - 1) : null)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t.wishlist.previousPage}
              </button>
              <span className="text-xs text-muted">
                {t.wishlist.pageRange
                  .replace('{start}', String(pageStart + 1))
                  .replace('{end}', String(Math.min(sorted.length, pageStart + WISHLIST_PAGE_SIZE)))
                  .replace('{total}', String(sorted.length))}
              </span>
              <button
                type="button"
                className="btn min-h-[44px]"
                disabled={page >= totalPages}
                onClick={() => setParam('page', String(page + 1))}
              >
                {t.wishlist.nextPage}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </nav>
          )}

          {selectMode && selected.size > 0 && (
            <div
              className="fixed bottom-16 left-1/2 z-50 w-[min(96vw,32rem)] -translate-x-1/2 rounded-full border border-border bg-bg-card px-4 py-2 shadow-card sm:bottom-4"
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
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
                  {t.wishlist.deleteSelected}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={deleting}
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
