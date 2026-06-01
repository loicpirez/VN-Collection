'use client';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, Calendar, CheckSquare, ChevronDown, Clock, Filter, FilterX, GripVertical, HardDriveDownload, Home, LayoutGrid, LayoutTemplate, MoreHorizontal, Package, Search, SlidersHorizontal, Star, Tags as TagsIcon, X } from 'lucide-react';
import { VnCard } from './VnCard';
import { toCardData } from './cardData';
import { SkeletonBlock, SkeletonCardGrid } from './Skeleton';
import { StatusIcon } from './StatusIcon';
import { BulkDownloadButton } from './BulkDownloadButton';
import { BulkActionBar } from './BulkActionBar';
import { SortableGrid } from './SortableGrid';
import { RandomPickButton } from './RandomPickButton';
import { SAVED_FILTERS_OPEN_EVENT, SavedFilters } from './SavedFilters';
import { HOME_LAYOUT_OPEN_EVENT } from './HomeLayoutEditorTrigger';
import { readApiError } from '@/lib/api-error-read';
import { ErrorAlert } from '@/components/ErrorAlert';
import { formatMinutes } from '@/lib/format';
import { useLocale, useT } from '@/lib/i18n/client';
import { BCP47, fmtNum } from '@/lib/locale-number';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { CardDensitySlider } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { STATUSES, type Status } from '@/lib/types';
import type { CollectionItem, ProducerStat, SeriesRow, Stats } from '@/lib/types';
import { ASPECT_KEYS, isAspectKey, type AspectKey } from '@/lib/aspect-ratio';
import {
  calculateVirtualGridWindow,
  parseCssPixelValue,
  VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT,
  VIRTUAL_GRID_DEFAULT_WIDTH,
  VIRTUAL_GRID_THRESHOLD,
} from '@/lib/virtual-grid';

/**
 * Tri-state flag panel for the long tail of boolean library filters.
 * Lazy-loaded behind the Advanced Filters drawer so its module chunk
 * never ships on the library first paint; it loads only once the
 * user opens the drawer that mounts it.
 */
const MoreFilters = dynamic(() => import('./library/MoreFilters').then((m) => m.MoreFilters), {
  ssr: false,
  loading: () => <SkeletonBlock className="mt-3 h-28 w-full rounded-lg" />,
});

type SortKey =
  | 'updated_at'
  | 'added_at'
  | 'title'
  | 'rating'
  | 'user_rating'
  | 'playtime'
  | 'length_minutes'
  | 'egs_playtime'
  | 'combined_playtime'
  | 'released'
  | 'producer'
  | 'publisher'
  | 'egs_rating'
  | 'combined_rating'
  | 'custom';
const SORT_KEYS: SortKey[] = [
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'length_minutes',
  'egs_playtime',
  'combined_playtime',
  'released',
  'producer',
  'publisher',
  'egs_rating',
  'combined_rating',
  'custom',
];

type GroupKey = 'none' | 'tag' | 'producer' | 'publisher' | 'status' | 'series' | 'aspect' | 'year' | 'place' | 'edition';
const GROUP_KEYS: GroupKey[] = ['none', 'status', 'producer', 'publisher', 'tag', 'series', 'aspect', 'year', 'place', 'edition'];
type GroupSortKey = 'count' | 'name' | 'released';
const GROUP_SORT_KEYS: GroupSortKey[] = ['count', 'name', 'released'];

const Q_DEBOUNCE_MS = 300;

interface CollectionResponse {
  items: CollectionItem[];
  stats: Stats;
}

interface PendingCollectionRequest {
  controller: AbortController;
  consumers: number;
  promise: Promise<CollectionResponse>;
}

const pendingCollectionRequests = new Map<string, PendingCollectionRequest>();

function requestCollection(url: string, fallbackError: string): {
  promise: Promise<CollectionResponse>;
  release: () => void;
} {
  let request = pendingCollectionRequests.get(url);
  if (!request) {
    const controller = new AbortController();
    const promise = fetch(url, { signal: controller.signal, cache: 'no-store' }).then(
      async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, fallbackError));
        return response.json() as Promise<CollectionResponse>;
      },
    );
    request = { controller, consumers: 0, promise };
    pendingCollectionRequests.set(url, request);
    const activeRequest = request;
    void promise.then(
      () => {
        if (pendingCollectionRequests.get(url) === activeRequest) {
          pendingCollectionRequests.delete(url);
        }
      },
      () => {
        if (pendingCollectionRequests.get(url) === activeRequest) {
          pendingCollectionRequests.delete(url);
        }
      },
    );
  }
  const activeRequest = request;
  activeRequest.consumers += 1;
  let released = false;
  return {
    promise: activeRequest.promise,
    release: () => {
      if (released) return;
      released = true;
      activeRequest.consumers -= 1;
      if (
        activeRequest.consumers === 0 &&
        pendingCollectionRequests.get(url) === activeRequest
      ) {
        activeRequest.controller.abort();
        pendingCollectionRequests.delete(url);
      }
    },
  };
}

function filterScore(it: CollectionItem): number | null {
  const values = [it.user_rating, it.rating, it.egs?.median].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function filterPlaytimeHours(it: CollectionItem): number | null {
  const minutes =
    it.playtime_minutes && it.playtime_minutes > 0 ? it.playtime_minutes
    : it.egs?.playtime_median_minutes && it.egs.playtime_median_minutes > 0 ? it.egs.playtime_median_minutes
    : it.length_minutes && it.length_minutes > 0 ? it.length_minutes
    : null;
  return minutes == null ? null : Math.round(minutes / 60);
}

/**
 * Render mode for the Library client.
 *  - 'full' (default): standalone /library page — render both the
 *    toolbar (chips/search/filters/sort/group/density/actions)
 *    and the VN grid.
 *  - 'controls-only': the home-page "Library · filters & sort"
 *    section. Renders the toolbar only; the grid is hidden so the
 *    sibling section can host it independently.
 *  - 'grid-only': the home-page "Library · grid" section. Renders
 *    the grid only; the toolbar is hidden.
 *
 * URL state (status / search / sort / group / filters / density) is
 * shared because both modes derive from `useSearchParams`; changing
 * a filter in the controls section re-renders the grid section
 * immediately via the URL.
 */
export type LibraryClientMode = 'full' | 'controls-only' | 'grid-only';

/**
 * P-153: extracted search input so only the input re-renders on each
 * keystroke. The parent `LibraryClient` is a 2000-line tree with the
 * card grid + filter chips + sort/group selects — re-rendering all of
 * that per keystroke was the dominant frame-budget cost while typing.
 *
 * The component owns its own `value` state locally; on debounced
 * change it calls `onCommit` to push the trimmed value into URL state.
 * Parent supplies the current URL value via `urlValue` so an external
 * clear (e.g. Reset filters) propagates back into this input.
 */
const SearchInput = memo(function SearchInput({
  urlValue,
  placeholder,
  clearLabel,
  onCommit,
  debounceMs,
}: {
  urlValue: string;
  placeholder: string;
  clearLabel: string;
  onCommit: (next: string) => void;
  debounceMs: number;
}) {
  const [draft, setDraft] = useState(urlValue);
  // Sync from URL when an external reset / nav happens. Local typing
  // drives the input but the URL is the source of truth on mount.
  useEffect(() => {
    setDraft(urlValue);
  }, [urlValue]);
  // Debounced commit — keep the timer outside React state to avoid
  // re-rendering on every tick.
  useEffect(() => {
    if (draft === urlValue) return;
    const handle = setTimeout(() => onCommit(draft.trim()), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, urlValue, onCommit, debounceMs]);
  return (
    <div className="relative min-w-[180px] flex-1">
      <input
        data-vn-search
        inputMode="search"
        className="input w-full pr-8"
        placeholder={placeholder}
        aria-label={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => setDraft('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
});

export function LibraryClient({ mode = 'full' }: { mode?: LibraryClientMode } = {}) {
  const showControls = mode !== 'grid-only';
  const showGrid = mode !== 'controls-only';
  const t = useT();
  const locale = useLocale();
  const collator = useMemo(() => new Intl.Collator(BCP47[locale], { sensitivity: 'base', numeric: true }), [locale]);
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive every filter / sort / group from the URL so they survive navigation.
  const status = (searchParams.get('status') ?? '') as Status | '';
  const producer = searchParams.get('producer') ?? '';
  const publisher = searchParams.get('publisher') ?? '';
  const seriesId = searchParams.get('series') ?? '';
  const urlTag = searchParams.get('tag') ?? '';
  const urlPlace = searchParams.get('place') ?? '';
  const urlEdition = searchParams.get('edition') ?? '';
  const urlYearMin = searchParams.get('yearMin') ?? '';
  const urlYearMax = searchParams.get('yearMax') ?? '';
  const urlRatingMin = searchParams.get('ratingMin') ?? '';
  const urlRatingMax = searchParams.get('ratingMax') ?? '';
  const urlPlaytimeMin = searchParams.get('playtimeMin') ?? '';
  const urlPlaytimeMax = searchParams.get('playtimeMax') ?? '';
  const urlDumped = searchParams.get('dumped') ?? '';
  // Multi-select aspect. URL state encoded as comma-separated:
  // `?aspect=4:3,16:9`. Back-compat with the prior single-value URL.
  const urlAspectRaw = searchParams.get('aspect');
  const urlAspectSet: AspectKey[] = (urlAspectRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isAspectKey(s)) as AspectKey[];
  // Single-aspect convenience for chip rendering + old-style callers.
  const urlAspect: AspectKey | '' = urlAspectSet[0] ?? '';
  const urlQ = searchParams.get('q') ?? '';
  // Default sort, order, and grouping are configurable in Settings; we
  // load them once and use them as fallbacks when the URL has no
  // matching param. URL params ALWAYS win — these defaults only apply
  // when the user lands on `/` with no query string.
  const [defaultSort, setDefaultSort] = useState<SortKey>('updated_at');
  const [defaultOrder, setDefaultOrder] = useState<'asc' | 'desc'>('desc');
  const [defaultGroup, setDefaultGroup] = useState<GroupKey>('none');
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/settings', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { default_sort?: string; default_order?: string; default_group?: string } | null) => {
        if (ctrl.signal.aborted || !d) return;
        if ((SORT_KEYS as readonly string[]).includes(d.default_sort ?? '')) {
          setDefaultSort(d.default_sort as SortKey);
        }
        if (d.default_order === 'asc' || d.default_order === 'desc') {
          setDefaultOrder(d.default_order);
        }
        if ((GROUP_KEYS as readonly string[]).includes(d.default_group ?? '')) {
          setDefaultGroup(d.default_group as GroupKey);
        }
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[LibraryClient] settings fetch failed:', e);
      });
    return () => ctrl.abort();
  }, []);
  const urlSort = searchParams.get('sort');
  const sort: SortKey = urlSort && (SORT_KEYS as readonly string[]).includes(urlSort)
    ? (urlSort as SortKey)
    : defaultSort;
  const urlOrder = searchParams.get('order');
  const order: 'asc' | 'desc' =
    urlOrder === 'asc' || urlOrder === 'desc' ? urlOrder : defaultOrder;
  const urlGroup = searchParams.get('group');
  const group: GroupKey = urlGroup && (GROUP_KEYS as readonly string[]).includes(urlGroup)
    ? (urlGroup as GroupKey)
    : defaultGroup;
  const urlGroupSort = searchParams.get('groupSort');
  const groupSort: GroupSortKey =
    urlGroupSort && (GROUP_SORT_KEYS as readonly string[]).includes(urlGroupSort)
      ? (urlGroupSort as GroupSortKey)
      : 'count';

  const searchParamsString = searchParams.toString();
  const replaceParams = useCallback(
    (mutator: (sp: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParamsString);
      mutator(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    },
    [router, searchParamsString],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      replaceParams((sp) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
    },
    [replaceParams],
  );

  const commitSearch = useCallback(
    (next: string) => setParam('q', next || null),
    [setParam],
  );

  const { settings, set } = useDisplaySettings();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byStatus: [], playtime_minutes: 0 });
  const [producers, setProducers] = useState<ProducerStat[]>([]);
  const [publishers, setPublishers] = useState<ProducerStat[]>([]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);
  const [collectionTags, setCollectionTags] = useState<{ id: string; name: string; vn_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  // Gates the empty-state copy so we never flash "no results" before
  // at least one fetch has resolved. setLoading alone is not enough —
  // a fast 0-result response would still show the empty state before
  // the user sees the skeleton.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagName, setTagName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const onBulkItemDone = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [resettingOrder, setResettingOrder] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [yearMinInput, setYearMinInput] = useState(urlYearMin);
  const [yearMaxInput, setYearMaxInput] = useState(urlYearMax);
  const [ratingMinInput, setRatingMinInput] = useState(urlRatingMin);
  const [ratingMaxInput, setRatingMaxInput] = useState(urlRatingMax);
  const [playtimeMinInput, setPlaytimeMinInput] = useState(urlPlaytimeMin);
  const [playtimeMaxInput, setPlaytimeMaxInput] = useState(urlPlaytimeMax);

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

  const facetsFetchedRef = useRef(false);
  const facetsAbortRef = useRef<AbortController | null>(null);
  const requestFacets = useCallback(() => {
    if (facetsFetchedRef.current || facetsAbortRef.current) return;
    const ctrl = new AbortController();
    facetsAbortRef.current = ctrl;
    const opts: RequestInit = { signal: ctrl.signal, cache: 'no-store' };
    const readFacet = async <T,>(url: string): Promise<T> => {
      const response = await fetch(url, opts);
      if (!response.ok) {
        throw new Error(t.common.httpStatus.replace('{status}', String(response.status)));
      }
      return response.json() as Promise<T>;
    };
    void Promise.all([
      readFacet<{ producers?: ProducerStat[]; publishers?: ProducerStat[] }>('/api/producers'),
      readFacet<{ series?: SeriesRow[] }>('/api/series'),
      readFacet<{ known_places?: string[] }>('/api/places'),
      readFacet<{ tags?: { id: string; name: string; vn_count: number }[] }>('/api/collection/tags'),
    ])
      .then(([producerData, seriesData, placeData, tagData]) => {
        if (ctrl.signal.aborted) return;
        setProducers(producerData.producers ?? []);
        setPublishers(producerData.publishers ?? []);
        setSeries(seriesData.series ?? []);
        setKnownPlaces(placeData.known_places ?? []);
        setCollectionTags((tagData.tags ?? []).slice(0, 200));
        facetsFetchedRef.current = true;
      })
      .catch((error: Error) => {
        if (ctrl.signal.aborted || error.name === 'AbortError') return;
        toast.error(`${t.common.error}: ${error.message}`);
      })
      .finally(() => {
        if (facetsAbortRef.current === ctrl) facetsAbortRef.current = null;
      });
  }, [toast, t.common.error, t.common.httpStatus]);

  useEffect(() => {
    return () => facetsAbortRef.current?.abort();
  }, []);

  // Resolve tag name when filtered by tag
  useEffect(() => {
    if (!urlTag) {
      setTagName(null);
      return;
    }
    setTagName(urlTag);
    const ctrl = new AbortController();
    fetch(`/api/tags?q=${encodeURIComponent(urlTag)}&results=1`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((d: { tags?: { id: string; name: string }[] }) => {
        if (ctrl.signal.aborted) return;
        const found = d.tags?.find((tag) => tag.id === urlTag);
        if (found) setTagName(found.name);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        toast.error(`${t.common.error}: ${(e as Error).message ?? String(e)}`);
      });
    return () => ctrl.abort();
  }, [urlTag, toast, t.common.error]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (producer) params.set('producer', producer);
    if (publisher) params.set('publisher', publisher);
    if (seriesId) params.set('series', seriesId);
    if (urlTag) params.set('tag', urlTag);
    if (urlPlace) params.set('place', urlPlace);
    if (urlEdition) params.set('edition', urlEdition);
    if (urlYearMin) params.set('yearMin', urlYearMin);
    if (urlYearMax) params.set('yearMax', urlYearMax);
    if (urlDumped === '1' || urlDumped === '0') params.set('dumped', urlDumped);
    if (urlAspectSet.length > 0) params.set('aspect', urlAspectSet.join(','));
    if (urlQ) params.set('q', urlQ);
    params.set('sort', sort);
    params.set('order', order);
    const request = requestCollection(`/api/collection?${params}`, t.common.error);
    request.promise
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setStats(data.stats);
        setHasLoadedOnce(true);
      })
      .catch((e: Error) => {
        if (!alive || e.name === 'AbortError') return;
        console.error('[LibraryClient] collection load failed:', e);
        setError(e.message || t.common.error);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      request.release();
    };
    // join the multi-select aspect set for a stable string identity
    // so changing 4:3 ↔ 16:9 re-fetches.
  }, [status, producer, publisher, seriesId, urlTag, urlPlace, urlEdition, urlYearMin, urlYearMax, urlDumped, urlAspectSet.join(','), urlQ, sort, order, refreshKey, t.common.error]);

  function clearAll() {
    // SearchInput re-syncs draft from urlQ on URL change, so clearing
    // the URL is enough.
    router.replace('/', { scroll: false });
  }

  const counts = useMemo(
    () => Object.fromEntries(stats.byStatus.map((s) => [s.status, s.n])) as Record<Status, number>,
    [stats],
  );
  const totalPlaytime = formatMinutes(stats.playtime_minutes, locale, t.year, { emptyValue: 'allow_zero' });
  const baseHasFilters =
    !!status || !!producer || !!publisher || !!seriesId || !!urlQ || !!urlTag || !!urlPlace || !!urlEdition || !!urlYearMin || !!urlYearMax || !!urlRatingMin || !!urlRatingMax || !!urlPlaytimeMin || !!urlPlaytimeMax || urlAspectSet.length > 0 || urlDumped === '1' || urlDumped === '0';
  const yearLabel = urlYearMin && urlYearMax
    ? urlYearMin === urlYearMax
      ? urlYearMin
      : `${urlYearMin}–${urlYearMax}`
    : urlYearMin
      ? `≥ ${urlYearMin}`
      : urlYearMax
        ? `≤ ${urlYearMax}`
        : '';

  function clearYear() {
    setYearMinInput('');
    setYearMaxInput('');
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('yearMin');
    sp.delete('yearMax');
    const qs = sp.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }

  function clearRange(minKey: string, maxKey: string, setMin: (value: string) => void, setMax: (value: string) => void) {
    setMin('');
    setMax('');
    replaceParams((sp) => {
      sp.delete(minKey);
      sp.delete(maxKey);
    });
  }

  useEffect(() => {
    setYearMinInput(urlYearMin);
    setYearMaxInput(urlYearMax);
  }, [urlYearMin, urlYearMax]);
  useEffect(() => {
    setRatingMinInput(urlRatingMin);
    setRatingMaxInput(urlRatingMax);
  }, [urlRatingMin, urlRatingMax]);
  useEffect(() => {
    setPlaytimeMinInput(urlPlaytimeMin);
    setPlaytimeMaxInput(urlPlaytimeMax);
  }, [urlPlaytimeMin, urlPlaytimeMax]);

  // URL-driven checkbox filters. Each value is `'1'` (only-matching),
  // `'0'` (only-NOT-matching), or absent (no filter). Names map to keys of
  // `boolFilter` below. URL-persisted so they survive navigation.
  const urlOnlyEgsOnly = searchParams.get('only_egs_only');
  const urlMatchVndb = searchParams.get('match_vndb');
  const urlMatchEgs = searchParams.get('match_egs');
  const urlFanDisc = searchParams.get('fan_disc');
  const urlHasNotes = searchParams.get('has_notes');
  const urlHasCustomCover = searchParams.get('has_custom_cover');
  const urlHasBanner = searchParams.get('has_banner');
  const urlIsFavorite = searchParams.get('is_favorite');
  const urlHasReleased = searchParams.get('has_released');
  const urlIsNsfw = searchParams.get('is_nsfw');
  const urlIsNukige = searchParams.get('is_nukige');
  const urlInReadingQueue = searchParams.get('in_reading_queue');
  const urlInList = searchParams.get('in_list');

  // Count of filters that live inside the Advanced drawer (used for
  // the chip-badge on the drawer toggle so the user knows the drawer
  // is hiding active filters). Placed AFTER all url-state reads so
  // every flag is defined before counting.
  const advancedFilterCount =
    (producer ? 1 : 0) +
    (publisher ? 1 : 0) +
    (seriesId ? 1 : 0) +
    (urlTag ? 1 : 0) +
    (urlPlace ? 1 : 0) +
    (urlEdition ? 1 : 0) +
    (urlAspectSet.length > 0 ? 1 : 0) +
    (urlDumped ? 1 : 0) +
    (urlYearMin || urlYearMax ? 1 : 0) +
    (urlRatingMin || urlRatingMax ? 1 : 0) +
    (urlPlaytimeMin || urlPlaytimeMax ? 1 : 0) +
    (urlMatchVndb ? 1 : 0) +
    (urlMatchEgs ? 1 : 0) +
    (urlOnlyEgsOnly ? 1 : 0) +
    (urlFanDisc ? 1 : 0) +
    (urlIsFavorite ? 1 : 0) +
    (urlHasNotes ? 1 : 0) +
    (urlHasCustomCover ? 1 : 0) +
    (urlHasBanner ? 1 : 0) +
    (urlHasReleased ? 1 : 0) +
    (urlIsNsfw ? 1 : 0) +
    (urlIsNukige ? 1 : 0) +
    (urlInReadingQueue ? 1 : 0) +
    (urlInList ? 1 : 0);
  const hasFilters = baseHasFilters || advancedFilterCount > 0;

  function ternaryMatches(want: string | null, actual: boolean): boolean {
    if (want === '1') return actual === true;
    if (want === '0') return actual === false;
    return true;
  }

  // Hard-filter R18 entries when the user opts in. Done client-side so toggling
  // takes effect instantly without re-querying. Four independent signals
  // OR'd — covers SFW eroge like Comic Party where the cover and Nukige tag
  // are both clean but the game ships 18+ releases:
  //   1. cover `image_sexual` >= NSFW threshold (numeric, no false positive).
  //   2. EGS `erogame` strict boolean — flags ANY game with erotic content
  //      including story-heavy ones with SFW covers. Strongest single signal.
  //   3. EGS `okazu` — pure-ero / nukige. Narrower than erogame; kept for
  //      backwards compat with old rows that have okazu but not erogame.
  //   4. any VNDB tag whose `category` field equals `"ero"`. `category` is a
  //      strict enum on VNDB (only `cont` / `ero` / `tech`), NOT a free-form
  //      name — so tag names like "Sexual Content", "no ero", etc. don't
  //      get string-matched. We don't gate on `spoiler` here: a VN whose
  //      only ero tags are spoiler-flagged is still adult content.
  function isAdult(it: CollectionItem): boolean {
    if (isExplicit(it.image_sexual, settings.nsfwThreshold)) return true;
    if (it.egs?.erogame === true) return true;
    if (it.egs?.okazu === true) return true;
    if ((it.tags ?? []).some((tag) => tag.category === 'ero')) return true;
    return false;
  }

  const visibleItems = useMemo(
    () =>
      items.filter((it) => {
        const ratingMin = urlRatingMin ? Number(urlRatingMin) : null;
        const ratingMax = urlRatingMax ? Number(urlRatingMax) : null;
        const playtimeMinHours = urlPlaytimeMin ? Number(urlPlaytimeMin) : null;
        const playtimeMaxHours = urlPlaytimeMax ? Number(urlPlaytimeMax) : null;
        const score = filterScore(it);
        const playtimeHours = filterPlaytimeHours(it);
        if (settings.hideSexual && isAdult(it)) return false;
        if (ratingMin != null && Number.isFinite(ratingMin) && (score == null || score < ratingMin)) return false;
        if (ratingMax != null && Number.isFinite(ratingMax) && (score == null || score > ratingMax)) return false;
        if (playtimeMinHours != null && Number.isFinite(playtimeMinHours) && (playtimeHours == null || playtimeHours < playtimeMinHours)) return false;
        if (playtimeMaxHours != null && Number.isFinite(playtimeMaxHours) && (playtimeHours == null || playtimeHours > playtimeMaxHours)) return false;
        if (!ternaryMatches(urlOnlyEgsOnly, it.id.startsWith('egs_'))) return false;
        if (!ternaryMatches(urlMatchVndb, !it.id.startsWith('egs_'))) return false;
        if (!ternaryMatches(urlMatchEgs, !!it.egs?.egs_id)) return false;
        if (!ternaryMatches(urlFanDisc, (it.relations ?? []).some((r) => r.relation === 'orig'))) return false;
        if (!ternaryMatches(urlHasNotes, it.has_notes ?? !!(it.notes && it.notes.trim().length > 0))) return false;
        if (!ternaryMatches(urlHasCustomCover, !!it.custom_cover)) return false;
        if (!ternaryMatches(urlHasBanner, !!it.banner_image)) return false;
        if (!ternaryMatches(urlIsFavorite, !!it.favorite)) return false;
        if (!ternaryMatches(urlHasReleased, !!it.released)) return false;
        if (!ternaryMatches(urlIsNsfw, isAdult(it))) return false;
        // Nukige: a VN tagged "Nukige" on VNDB. Tag-name match is
        // case-insensitive because VNDB capitalises it but locales
        // vary. (The previous attempt also tried to match against
        // an EGS `axis` field, but that field is never returned by
        // the collection API — the branch was dead.)
        if (!ternaryMatches(
          urlIsNukige,
          (it.tags ?? []).some((tag) => tag.name?.toLowerCase() === 'nukige'),
        )) return false;
        if (!ternaryMatches(urlInReadingQueue, !!it.in_reading_queue)) return false;
        if (!ternaryMatches(urlInList, (it.list_count ?? 0) > 0)) return false;
        return true;
      }),
    [
      items,
      settings.hideSexual,
      settings.nsfwThreshold,
      urlOnlyEgsOnly,
      urlMatchVndb,
      urlMatchEgs,
      urlFanDisc,
      urlHasNotes,
      urlHasCustomCover,
      urlHasBanner,
      urlIsFavorite,
      urlHasReleased,
      urlIsNsfw,
      urlIsNukige,
      urlInReadingQueue,
      urlInList,
      urlRatingMin,
      urlRatingMax,
      urlPlaytimeMin,
      urlPlaytimeMax,
    ],
  );
  const hiddenBySexualCount = items.length - visibleItems.length;
  const groups = useMemo(() => groupItems(visibleItems, group, t, sort, order, groupSort, collator), [visibleItems, group, t, sort, order, groupSort, collator]);
  const randomPickCandidates = useMemo(
    () => visibleItems.map((it) => ({ id: it.id, title: it.title })),
    [visibleItems],
  );

  /**
   * Single source of truth for the sort / group / order / custom-sort
   * controls and the density / select / random / bulk-download
   * cluster. Rendered inline on `sm:` and up (the unchanged desktop
   * toolbar row) and inside the mobile `LibraryToolbarDrawer` panel
   * below `sm`, so every control stays reachable on phones without
   * duplicating its markup. `orientation` only governs how the
   * right-hand cluster aligns: pushed right with `ml-auto` on the
   * desktop row, stacked full-width inside the mobile panel.
   */
  const renderToolbarControls = (orientation: 'row' | 'column') => (
    <>
      <label className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t.library.sortLabel}</span>
        <select
          className="input w-auto"
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          aria-label={t.library.sortLabel}
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>{t.library.sort[k]}</option>
          ))}
        </select>
      </label>
      {group !== 'none' && (
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t.library.groupSortLabel}</span>
          <select
            className="input w-auto"
            value={groupSort}
            onChange={(e) => setParam('groupSort', e.target.value)}
            aria-label={t.library.groupSortLabel}
          >
            <option value="count">{t.library.groupSortCount}</option>
            <option value="name">{t.library.groupSortName}</option>
            <option value="released">{t.library.groupSortReleased}</option>
          </select>
        </label>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => setParam('order', order === 'asc' ? 'desc' : 'asc')}
        aria-label={order === 'asc' ? t.library.sortAsc : t.library.sortDesc}
      >
        {order === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </button>
      <button
        type="button"
        className={`btn inline-flex items-center gap-1 ${sort === 'custom' ? 'btn-primary' : ''}`}
        onClick={() => setParam('sort', sort === 'custom' ? null : 'custom')}
        aria-label={sort === 'custom' ? t.library.customSortExit : t.library.customSortEnter}
        title={t.library.customSortHint}
      >
        <GripVertical className="h-4 w-4" />
        <span>
          {sort === 'custom' ? t.library.customSortExit : t.library.customSortEnter}
        </span>
      </button>
      <label className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t.library.groupBy}</span>
        <select
          className="input w-auto"
          value={group}
          onChange={(e) => setParam('group', e.target.value === 'none' ? null : e.target.value)}
          aria-label={t.library.groupBy}
        >
          {GROUP_KEYS.map((g) => (
            <option key={g} value={g}>
              {g === 'none'
                ? t.library.groupNone
                : g === 'tag'
                ? t.library.groupTag
                : g === 'producer'
                ? t.library.groupDeveloper
                : g === 'publisher'
                ? t.library.groupPublisher
                : g === 'series'
                ? t.library.groupSeries
                : g === 'aspect'
                ? t.library.groupAspect
                : g === 'year'
                ? t.library.groupYear
                : g === 'place'
                ? t.library.groupPlace
                : g === 'edition'
                ? t.library.groupEdition
                : t.library.groupStatus}
            </option>
          ))}
        </select>
      </label>
      <div className={`flex flex-wrap items-center gap-3 ${orientation === 'row' ? 'ml-auto' : ''}`}>
        <CardDensitySlider scope="library" />
        <button
          type="button"
          onClick={() => set('denseLibrary', !settings.denseLibrary)}
          className={`btn ${settings.denseLibrary ? 'btn-primary' : ''}`}
          aria-label={settings.denseLibrary ? t.library.denseOn : t.library.denseOff}
          title={t.library.denseToggle}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>
            {settings.denseLibrary ? t.library.denseOn : t.library.denseOff}
          </span>
        </button>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex gap-6 text-sm text-muted"
        >
          <span><b className="text-white">{stats.total}</b> {t.library.stats.vnCount}</span>
          <span><b className="text-white">{totalPlaytime}</b> {t.library.stats.playedHours}</span>
        </div>
        {stats.total > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectMode) clearSelection();
              else setSelectMode(true);
            }}
            className={`btn ${selectMode ? 'btn-primary' : ''}`}
            aria-label={selectMode ? t.bulkEdit.exitSelectMode : t.bulkEdit.selectMode}
            title={t.bulkEdit.toggleSelectMode}
          >
            <CheckSquare className="h-4 w-4" />
            <span>
              {selectMode ? t.bulkEdit.exitSelectMode : t.bulkEdit.selectMode}
            </span>
          </button>
        )}
        {visibleItems.length > 0 && (
          <RandomPickButton candidates={randomPickCandidates} />
        )}
        {stats.total > 0 && <BulkDownloadButton onItemDone={onBulkItemDone} />}
      </div>
    </>
  );

  return (
    <DensityScopeProvider scope="library">
      {showControls && (
        <>
      {/*
        Status chips row. Wraps cleanly on narrow viewports + French
        labels — no horizontal scroll. The previous horizontal-scroll
        treatment caused chips like "Pour plus tard" / "Terminés" to
        run off the right edge under "Ma bibliothèque" and required
        the user to scroll the row, which they reported as overflow.
      */}
      <div
        role="group"
        aria-label={t.library.filterByStatus}
        className="mb-4 flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          className={`chip whitespace-nowrap ${!status ? 'chip-active' : ''}`}
          onClick={() => setParam('status', null)}
          aria-pressed={!status}
        >
          {t.library.all} <span className="ml-1 opacity-70">{stats.total}</span>
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip inline-flex items-center gap-1 whitespace-nowrap ${status === s ? 'chip-active' : ''}`}
            onClick={() => setParam('status', status === s ? null : s)}
            aria-pressed={status === s}
          >
            <StatusIcon status={s} className="h-3.5 w-3.5" />
            {t.status[s]}
            <span className="ml-1 opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {/*
        Compact toolbar (single row at md+): search + Advanced
        filters button. Active filter chips render below — only
        when there are filters worth showing — so the toolbar
        doesn't waste vertical space when no filters are active.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          urlValue={urlQ}
          placeholder={t.library.filterPlaceholder}
          clearLabel={t.library.clearSearch}
          onCommit={commitSearch}
          debounceMs={Q_DEBOUNCE_MS}
        />
        <AdvancedFiltersDrawer
          activeCount={advancedFilterCount}
          onOpen={requestFacets}
          t={t}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select
              className="input w-full"
              value={producer}
              onChange={(e) => setParam('producer', e.target.value || null)}
              aria-label={t.library.filterByDeveloper}
            >
              <option value="">{t.library.filterByDeveloper}</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.vn_count}
                </option>
              ))}
            </select>
            <select
              className="input w-full"
              value={publisher}
              onChange={(e) => setParam('publisher', e.target.value || null)}
              aria-label={t.library.filterByPublisher}
            >
              <option value="">{t.library.filterByPublisher}</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.vn_count}
                </option>
              ))}
            </select>
            <select
              className="input w-full"
              value={seriesId}
              onChange={(e) => setParam('series', e.target.value || null)}
              aria-label={t.library.filterBySeries}
            >
              <option value="">{t.library.filterBySeries}</option>
              {series.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <select
              className="input w-full"
              value={urlTag}
              onChange={(e) => setParam('tag', e.target.value || null)}
              aria-label={t.library.filterByTag}
            >
              <option value="">{t.library.filterByTag}</option>
              {collectionTags.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {tg.name} · {tg.vn_count}
                </option>
              ))}
            </select>
            <select
              className="input w-full"
              value={urlPlace}
              onChange={(e) => setParam('place', e.target.value || null)}
              aria-label={t.library.filterByPlace}
            >
              <option value="">{t.library.filterByPlace}</option>
              {knownPlaces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              className="input w-full"
              value={urlEdition}
              onChange={(e) => setParam('edition', e.target.value || null)}
              aria-label={t.library.filterByEdition}
            >
              <option value="">{t.library.filterByEdition}</option>
              {(['physical', 'digital', 'limited', 'standard', 'collector', 'download_code'] as const).map((ed) => (
                <option key={ed} value={ed}>
                  {(t.editions as Record<string, string>)[ed] ?? ed}
                </option>
              ))}
            </select>
            {/* Multi-select aspect filter. User can pick any
                combination of 4:3 / 16:9 / 16:10 / 21:9 / other /
                unknown. A VN matches if ANY selected aspect
                applies to it. URL: ?aspect=4:3,16:9. */}
            <div className="col-span-2 flex flex-col gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5 sm:col-span-3">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted">
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t.library.filterAspect}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ASPECT_KEYS.map((k) => {
                  const active = urlAspectSet.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const next = active
                          ? urlAspectSet.filter((x) => x !== k)
                          : [...urlAspectSet, k];
                        setParam('aspect', next.length > 0 ? next.join(',') : null);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        active
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-bg-card/40 text-muted hover:border-accent hover:text-accent'
                      }`}
                    >
                      {t.aspect.keys[k]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2 flex flex-col gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5 sm:col-span-3">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t.library.filterByYear}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.search.yearMin}
                  value={yearMinInput}
                  min={1980}
                  max={2040}
                  onChange={(e) => setYearMinInput(e.target.value)}
                  onBlur={() => setParam('yearMin', yearMinInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('yearMin', yearMinInput.trim() || null);
                  }}
                  aria-label={t.search.yearMin}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.search.yearMax}
                  value={yearMaxInput}
                  min={1980}
                  max={2040}
                  onChange={(e) => setYearMaxInput(e.target.value)}
                  onBlur={() => setParam('yearMax', yearMaxInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('yearMax', yearMaxInput.trim() || null);
                  }}
                  aria-label={t.search.yearMax}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t.library.filterByScore}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.library.scoreMin}
                  value={ratingMinInput}
                  min={0}
                  max={100}
                  onChange={(e) => setRatingMinInput(e.target.value)}
                  onBlur={() => setParam('ratingMin', ratingMinInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('ratingMin', ratingMinInput.trim() || null);
                  }}
                  aria-label={t.library.scoreMin}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.library.scoreMax}
                  value={ratingMaxInput}
                  min={0}
                  max={100}
                  onChange={(e) => setRatingMaxInput(e.target.value)}
                  onBlur={() => setParam('ratingMax', ratingMaxInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('ratingMax', ratingMaxInput.trim() || null);
                  }}
                  aria-label={t.library.scoreMax}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t.library.filterByPlaytime}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.library.playtimeMin}
                  value={playtimeMinInput}
                  min={0}
                  onChange={(e) => setPlaytimeMinInput(e.target.value)}
                  onBlur={() => setParam('playtimeMin', playtimeMinInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('playtimeMin', playtimeMinInput.trim() || null);
                  }}
                  aria-label={t.library.playtimeMin}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input w-24"
                  placeholder={t.library.playtimeMax}
                  value={playtimeMaxInput}
                  min={0}
                  onChange={(e) => setPlaytimeMaxInput(e.target.value)}
                  onBlur={() => setParam('playtimeMax', playtimeMaxInput.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setParam('playtimeMax', playtimeMaxInput.trim() || null);
                  }}
                  aria-label={t.library.playtimeMax}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = urlDumped === '1' ? '0' : urlDumped === '0' ? null : '1';
                setParam('dumped', next);
              }}
              className={`flex items-center gap-2 rounded-md border bg-bg-elev/40 px-2 py-1.5 text-xs ${
                urlDumped ? 'border-accent text-accent' : 'border-border text-muted'
              }`}
              title={
                urlDumped === '1'
                  ? t.library.filterDumpedYes
                  : urlDumped === '0'
                    ? t.library.filterDumpedNo
                    : t.library.filterDumpedAll
              }
            >
              <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />
              <span>
                {urlDumped === '1'
                  ? t.library.filterDumpedYes
                  : urlDumped === '0'
                    ? t.library.filterDumpedNo
                    : t.library.filterDumped}
              </span>
            </button>
          </div>
          <MoreFilters
            values={{
              match_vndb: urlMatchVndb,
              match_egs: urlMatchEgs,
              only_egs_only: urlOnlyEgsOnly,
              fan_disc: urlFanDisc,
              has_notes: urlHasNotes,
              has_custom_cover: urlHasCustomCover,
              has_banner: urlHasBanner,
              is_favorite: urlIsFavorite,
              has_released: urlHasReleased,
              is_nsfw: urlIsNsfw,
              is_nukige: urlIsNukige,
              in_reading_queue: urlInReadingQueue,
              in_list: urlInList,
            }}
            onCycle={(key) => {
              const cur = searchParams.get(key);
              const next = cur === '1' ? '0' : cur === '0' ? null : '1';
              setParam(key, next);
            }}
            onReset={() => {
              const keys = [
                'match_vndb',
                'match_egs',
                'only_egs_only',
                'fan_disc',
                'has_notes',
                'has_custom_cover',
                'has_banner',
                'is_favorite',
                'has_released',
                'is_nsfw',
                'is_nukige',
                'in_reading_queue',
                'in_list',
              ];
              replaceParams((sp) => {
                for (const k of keys) sp.delete(k);
              });
            }}
            t={t}
          />
        </AdvancedFiltersDrawer>
        {/*
          Compact Options/Actions menu. Per the user's two-level
          toolbar spec, the status/search row must collapse
          Préréglages + Mise en page de l'accueil + Save preset +
          Reset filters into a single ⋯ surface — no standalone
          Préréglages chip and no floating "Mise en page de
          l'accueil" icon at the top of the home page. The
          SavedFilters sibling below mounts with `triggerHidden`
          so the popover triggered via the SAVED_FILTERS_OPEN_EVENT
          bus stays reachable, while the visible toolbar shows
          only chips + search + Filtres + Options.
        */}
        <LibraryActionsMenu
          hasFilters={hasFilters}
          onResetFilters={clearAll}
          t={t}
        />
        <SavedFilters triggerHidden />
      </div>

      {/* Active-filter chip strip — only renders when something is
          active, so it doesn't waste vertical space in the default
          state. Each chip removes one filter; Clear all wipes them
          in one shot. */}
      {hasFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {producer && (
            <FilterChip
              icon={<TagsIcon className="h-3 w-3" aria-hidden />}
              label={producers.find((p) => p.id === producer)?.name ?? producer}
              onClear={() => setParam('producer', null)}
              t={t}
            />
          )}
          {publisher && (
            <FilterChip
              icon={<TagsIcon className="h-3 w-3" aria-hidden />}
              label={publishers.find((p) => p.id === publisher)?.name ?? publisher}
              onClear={() => setParam('publisher', null)}
              t={t}
            />
          )}
          {seriesId && (
            <FilterChip
              icon={<TagsIcon className="h-3 w-3" aria-hidden />}
              label={series.find((s) => String(s.id) === seriesId)?.name ?? seriesId}
              onClear={() => setParam('series', null)}
              t={t}
            />
          )}
          {urlTag && (
            <FilterChip
              icon={<TagsIcon className="h-3 w-3" aria-hidden />}
              label={tagName ?? urlTag}
              onClear={() => setParam('tag', null)}
              t={t}
            />
          )}
          {urlPlace && (
            <FilterChip
              icon={<Home className="h-3 w-3" aria-hidden />}
              label={urlPlace}
              onClear={() => setParam('place', null)}
              t={t}
            />
          )}
          {urlEdition && (
            <FilterChip
              icon={<Package className="h-3 w-3" aria-hidden />}
              label={
                (t.editions as Record<string, string>)[urlEdition] ?? urlEdition
              }
              onClear={() => setParam('edition', null)}
              t={t}
            />
          )}
          {yearLabel && (
            <FilterChip
              icon={<Calendar className="h-3 w-3" aria-hidden />}
              label={yearLabel}
              onClear={clearYear}
              t={t}
            />
          )}
          {urlAspectSet.map((k) => (
            <FilterChip
              key={`aspect-${k}`}
              icon={<LayoutGrid className="h-3 w-3" aria-hidden />}
              label={t.aspect.keys[k]}
              onClear={() => {
                const next = urlAspectSet.filter((x) => x !== k);
                setParam('aspect', next.length > 0 ? next.join(',') : null);
              }}
              t={t}
            />
          ))}
          {(urlRatingMin || urlRatingMax) && (
            <FilterChip
              icon={<Star className="h-3 w-3" aria-hidden />}
              label={`${urlRatingMin || '0'}-${urlRatingMax || '100'}`}
              onClear={() => clearRange('ratingMin', 'ratingMax', setRatingMinInput, setRatingMaxInput)}
              t={t}
            />
          )}
          {(urlPlaytimeMin || urlPlaytimeMax) && (
            <FilterChip
              icon={<Clock className="h-3 w-3" aria-hidden />}
              label={`${urlPlaytimeMin || '0'}-${urlPlaytimeMax || 'max'}h`}
              onClear={() => clearRange('playtimeMin', 'playtimeMax', setPlaytimeMinInput, setPlaytimeMaxInput)}
              t={t}
            />
          )}
          {urlDumped && (
            <FilterChip
              icon={<HardDriveDownload className="h-3 w-3" aria-hidden />}
              label={urlDumped === '1' ? t.library.filterDumpedYes : t.library.filterDumpedNo}
              onClear={() => setParam('dumped', null)}
              t={t}
            />
          )}
          <button
            type="button"
            className="ml-auto inline-flex min-h-[44px] items-center gap-1 px-2 text-xs text-muted hover:text-status-dropped"
            onClick={clearAll}
            title={t.library.clearFilters}
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden />
            {t.library.clearFilters}
          </button>
        </div>
      )}

      {/*
        Desktop toolbar (sm and up): unchanged single wrapping row.
        Hidden below sm, where the same controls live inside the
        LibraryToolbarDrawer panel so the cramped phone layout
        collapses behind one trigger without losing any control.
      */}
      <div className="mb-6 hidden flex-wrap items-center gap-3 border-t border-border/60 pt-4 sm:flex">
        {renderToolbarControls('row')}
      </div>
      <LibraryToolbarDrawer t={t}>
        {renderToolbarControls('column')}
      </LibraryToolbarDrawer>
        </>
      )}

      {showGrid && error && (
        <div className="mb-4">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}

      {showGrid && (
      <div>
        {loading || !hasLoadedOnce ? (
        <SkeletonCardGrid count={24} />
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">{t.library.empty.title}</h2>
          <p className="mb-4 text-muted">{hasFilters ? t.library.empty.descriptionFiltered : t.library.empty.description}</p>
          <Link href="/search" className="btn btn-primary">
            <Search className="h-4 w-4" /> {t.library.empty.cta}
          </Link>
        </div>
      ) : (
        <>
          {settings.hideSexual && (
            <div className="mb-4 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-[11px] text-muted">
              {t.settings.hideSexualNote.replace('{count}', String(hiddenBySexualCount))}
              <span className="ml-1 block text-[10px] opacity-80">{t.settings.hideSexualRefreshHint}</span>
            </div>
          )}
          {sort === 'custom' && group === 'none' && !selectMode && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-muted">
              <span>{t.library.customSortHint}</span>
              <button
                type="button"
                disabled={resettingOrder}
                onClick={async () => {
                  const ok = await confirm({
                    message: t.library.customSortReset,
                    tone: 'danger',
                  });
                  if (!ok) return;
                  setResettingOrder(true);
                  try {
                    await fetch('/api/collection/order', { method: 'DELETE' });
                    setRefreshKey((k) => k + 1);
                  } catch (e) {
                    toast.error(`${t.common.error}: ${(e as Error).message}`);
                  } finally {
                    setResettingOrder(false);
                  }
                }}
                className="rounded border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {t.library.customSortReset}
              </button>
            </div>
          )}
          {group === 'none' ? (
            sort === 'custom' && !selectMode ? (
              <SortableGrid
                items={visibleItems}
                dense={settings.denseLibrary}
                onReorder={(orderedIds) => {
                  // Optimistic local reorder so the grid doesn't snap back while
                  // the server roundtrip is in flight.
                  const byId = new Map(items.map((it) => [it.id, it]));
                  const next = orderedIds
                    .map((id) => byId.get(id))
                    .filter((x): x is CollectionItem => !!x);
                  setItems(next);
                  fetch('/api/collection/order', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: orderedIds }),
                  }).catch((e: Error) => {
                    toast.error(`${t.common.error}: ${e.message}`);
                  });
                }}
              />
            ) : (
              <>
                {items.length > VIRTUAL_GRID_THRESHOLD && (
                  <p className="mb-2 text-right text-[11px] text-muted">
                    {t.library.virtualScrollNotice.replace('{n}', fmtNum(items.length, locale))}
                  </p>
                )}
                <Grid
                  items={visibleItems}
                  selectMode={selectMode}
                  selected={selected}
                  onToggle={toggleSelected}
                  dense={settings.denseLibrary}
                />
              </>
            )
          ) : (
            <div className="space-y-10">
              {groups.map((g) => (
                <section key={g.key}>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
                    {group === 'tag' && <TagsIcon className="h-4 w-4 text-accent" aria-hidden />}
                    {g.label}
                    <span className="text-xs font-normal text-muted">{g.items.length}</span>
                  </h2>
                  <Grid
                    items={g.items}
                    selectMode={selectMode}
                    selected={selected}
                    onToggle={toggleSelected}
                    dense={settings.denseLibrary}
                  />
                </section>
              ))}
            </div>
          )}
        </>
      )}
      </div>
      )}

      {showGrid && selectMode && selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          onClear={clearSelection}
          onApplied={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </DensityScopeProvider>
  );
}

interface GridMeasurements {
  width: number;
  scrollY: number;
  viewportHeight: number;
  containerTop: number;
  densityPx: number;
}

const DEFAULT_GRID_MEASUREMENTS: GridMeasurements = {
  width: VIRTUAL_GRID_DEFAULT_WIDTH,
  scrollY: 0,
  viewportHeight: VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT,
  containerTop: 0,
  densityPx: 220,
};

function sameGridMeasurements(a: GridMeasurements, b: GridMeasurements): boolean {
  return a.width === b.width &&
    a.scrollY === b.scrollY &&
    a.viewportHeight === b.viewportHeight &&
    a.containerTop === b.containerTop &&
    a.densityPx === b.densityPx;
}

function Grid({
  items,
  selectMode = false,
  selected = new Set<string>(),
  onToggle,
  dense = false,
}: {
  items: CollectionItem[];
  selectMode?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  dense?: boolean;
}) {
  // Library grid is density-responsive via the shared
  // `--card-density-px` CSS variable (set by <CardDensitySlider>).
  // `denseLibrary` only tunes the GAP + cover-bias (a smaller minmax
  // floor so the same slider value yields more columns in dense
  // mode). The slider value itself is the floor; the grid auto-fills
  // remaining space at 1fr. Cards inside use `aspect-[2/3] w-full`
  // so cover size scales with column width.
  const cls = dense ? 'grid gap-4' : 'grid gap-3';
  const densityMul = dense ? 0.72 : 1;
  const gapPx = dense ? 16 : 12;
  /**
   * Density-aware virtualization threshold. Smaller cards (lower
   * `densityMul`) pack more columns per row, so more rows fit in the
   * viewport and the cost of rendering every item climbs sooner, so
   * the threshold scales down with `densityMul` to engage
   * virtualization earlier at higher density. Floored so small
   * collections still skip virtualization regardless of density.
   */
  const virtualThreshold = Math.max(
    Math.round(VIRTUAL_GRID_THRESHOLD / 2),
    Math.round(VIRTUAL_GRID_THRESHOLD * densityMul),
  );
  const gridStyle: React.CSSProperties = useMemo(
    () => ({
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, calc(var(--card-density-px, 220px) * ${densityMul})), 1fr))`,
    }),
    [densityMul],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const measureFrameRef = useRef<number | null>(null);
  const [measurements, setMeasurements] = useState<GridMeasurements>(DEFAULT_GRID_MEASUREMENTS);
  const measureGrid = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next: GridMeasurements = {
        width: Math.max(0, Math.round(rect.width)),
        scrollY: Math.max(0, Math.round(window.scrollY)),
        viewportHeight: Math.max(0, Math.round(window.innerHeight)),
        containerTop: Math.round(rect.top + window.scrollY),
        densityPx: parseCssPixelValue(getComputedStyle(el).getPropertyValue('--card-density-px'), 220),
      };
      setMeasurements((prev) => (sameGridMeasurements(prev, next) ? prev : next));
    });
  }, []);
  useEffect(() => {
    if (items.length <= virtualThreshold) return;
    const el = containerRef.current;
    if (!el) return;
    measureGrid();
    window.addEventListener('scroll', measureGrid, { passive: true });
    window.addEventListener('resize', measureGrid);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureGrid);
    observer?.observe(el);
    return () => {
      window.removeEventListener('scroll', measureGrid);
      window.removeEventListener('resize', measureGrid);
      observer?.disconnect();
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
    };
  }, [items.length, measureGrid, virtualThreshold]);
  const virtual = useMemo(
    () => calculateVirtualGridWindow({
      itemCount: items.length,
      width: measurements.width,
      scrollY: measurements.scrollY,
      viewportHeight: measurements.viewportHeight,
      containerTop: measurements.containerTop,
      densityPx: measurements.densityPx,
      densityMultiplier: densityMul,
      gapPx,
      threshold: virtualThreshold,
    }),
    [densityMul, gapPx, items.length, measurements, virtualThreshold],
  );
  const renderedItems = useMemo(
    () => (virtual.enabled ? items.slice(virtual.startIndex, virtual.endIndex) : items),
    [items, virtual.enabled, virtual.endIndex, virtual.startIndex],
  );
  // Stash the per-render onToggle in a ref so each `<VnCard>` can get
  // an `onSelect` reference that's stable across renders. Without this
  // the `() => onToggle?.(it.id)` arrow was freshly allocated every
  // render, defeating `React.memo(VnCard)` whenever a sibling state
  // ticked (search query, sort change, …).
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onSelectFor = useCallback((id: string) => {
    onToggleRef.current?.(id);
  }, []);
  // Re-project once per `items` reference change instead of identity-
  // caching each row. WeakMap-by-identity inside `toCardData` still
  // catches re-renders that re-use the same array, and `useMemo`
  const cardData = useMemo(() => renderedItems.map(toCardData), [renderedItems]);
  return (
    <div
      ref={containerRef}
      className={cls}
      style={gridStyle}
      data-virtualized-library-grid={virtual.enabled ? true : undefined}
      aria-rowcount={virtual.enabled ? virtual.totalRows : undefined}
    >
      {virtual.enabled && virtual.topSpacer > 0 && (
        <div aria-hidden style={{ gridColumn: '1 / -1', height: virtual.topSpacer }} />
      )}
      {renderedItems.map((it, i) => (
        <MemoCard
          key={it.id}
          id={it.id}
          data={cardData[i]}
          selectable={selectMode}
          selected={selected.has(it.id)}
          onSelect={onSelectFor}
        />
      ))}
      {virtual.enabled && virtual.bottomSpacer > 0 && (
        <div aria-hidden style={{ gridColumn: '1 / -1', height: virtual.bottomSpacer }} />
      )}
    </div>
  );
}

const MemoCard = memo(function MemoCard({
  id,
  data,
  selectable,
  selected,
  onSelect,
}: {
  id: string;
  data: ReturnType<typeof toCardData>;
  selectable: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const handle = useCallback(() => onSelect(id), [onSelect, id]);
  return (
    <VnCard
      selectable={selectable}
      selected={selected}
      onSelect={handle}
      data={data}
    />
  );
});

interface Group {
  key: string;
  label: string;
  items: CollectionItem[];
}

function groupItems(
  items: CollectionItem[],
  group: GroupKey,
  t: ReturnType<typeof useT>,
  sort: SortKey,
  order: 'asc' | 'desc',
  groupSort: GroupSortKey,
  collator: Intl.Collator,
): Group[] {
  if (group === 'none') return [{ key: 'all', label: '', items }];
  const map = new Map<string, Group>();
  const fallback = (label: string) => ({ key: '__none__', label, items: [] as CollectionItem[] });

  for (const it of items) {
    if (group === 'status') {
      const s = (it.status ?? 'planning') as Status;
      const label = t.status[s];
      const k = s;
      if (!map.has(k)) map.set(k, { key: k, label, items: [] });
      map.get(k)!.items.push(it);
    } else if (group === 'producer') {
      const dev = it.developers[0];
      // Fall back to the developer name when the id is missing or blank.
      // EGS-synthetic entries sometimes carry a brand_name without a VNDB
      const devKey = (dev?.id && dev.id.trim()) || (dev?.name && `n:${dev.name}`) || '__none__';
      const label = dev?.name ?? t.library.groupOther;
      if (!map.has(devKey)) map.set(devKey, { key: devKey, label, items: [] });
      map.get(devKey)!.items.push(it);
    } else if (group === 'publisher') {
      // Same shape as the developer group, but indexed on `vn.publishers`
      // — VNDB models publisher as a release-level role, so this bucket
      // is intentionally distinct from the developer bucket and a VN
      // with multiple publishers shows up under each.
      const pubs = (it.publishers ?? []).filter((p) => p && (p.id || p.name));
      if (pubs.length === 0) {
        const fb = map.get('__none__') ?? fallback(t.library.groupOther);
        fb.items.push(it);
        map.set('__none__', fb);
      } else {
        for (const pub of pubs) {
          const k = (pub.id && pub.id.trim()) || `n:${pub.name}`;
          if (!map.has(k)) map.set(k, { key: k, label: pub.name, items: [] });
          map.get(k)!.items.push(it);
        }
      }
    } else if (group === 'series') {
      const list = it.series ?? [];
      if (list.length === 0) {
        const fb = map.get('__none__') ?? fallback(t.library.groupOther);
        fb.items.push(it);
        map.set('__none__', fb);
      } else {
        for (const s of list) {
          const k = `s${s.id}`;
          if (!map.has(k)) map.set(k, { key: k, label: s.name, items: [] });
          map.get(k)!.items.push(it);
        }
      }
    } else if (group === 'aspect') {
      const aspects: AspectKey[] = it.aspect_keys && it.aspect_keys.length > 0 ? it.aspect_keys : ['unknown'];
      for (const aspect of aspects) {
        const label = t.aspect.keys[aspect];
        if (!map.has(aspect)) map.set(aspect, { key: aspect, label, items: [] });
        map.get(aspect)!.items.push(it);
      }
    } else if (group === 'tag') {
      const tags = (it.tags ?? []).filter((t) => t.spoiler === 0).slice(0, 3);
      if (tags.length === 0) {
        const fb = map.get('__none__') ?? fallback(t.library.groupOther);
        fb.items.push(it);
        map.set('__none__', fb);
      } else {
        for (const tag of tags) {
          const k = tag.id;
          if (!map.has(k)) map.set(k, { key: k, label: tag.name, items: [] });
          map.get(k)!.items.push(it);
        }
      }
    } else if (group === 'year') {
      const y = it.released?.slice(0, 4) || '__none__';
      const label = y === '__none__' ? t.library.groupOther : y;
      if (!map.has(y)) map.set(y, { key: y, label, items: [] });
      map.get(y)!.items.push(it);
    } else if (group === 'place') {
      const places = it.physical_location && it.physical_location.length > 0
        ? it.physical_location
        : null;
      if (!places) {
        const fb = map.get('__none__') ?? fallback(t.library.groupOther);
        fb.items.push(it);
        map.set('__none__', fb);
      } else {
        for (const pl of places) {
          if (!map.has(pl)) map.set(pl, { key: pl, label: pl, items: [] });
          map.get(pl)!.items.push(it);
        }
      }
    } else if (group === 'edition') {
      const ed = it.edition_type ?? 'none';
      const label = ed === 'none'
        ? t.library.groupOther
        : ((t.editions as Record<string, string>)[ed] ?? ed);
      if (!map.has(ed)) map.set(ed, { key: ed, label, items: [] });
      map.get(ed)!.items.push(it);
    }
  }
  const groups = Array.from(map.values());
  const direction = order === 'asc' ? 1 : -1;
  if (groupSort === 'name') {
    groups.sort((a, b) => collator.compare(a.label, b.label) * direction);
  } else if (groupSort === 'released') {
    groups.sort((a, b) => {
      const av = latestReleased(a.items);
      const bv = latestReleased(b.items);
      if (!av && !bv) return collator.compare(a.label, b.label);
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv);
      return cmp === 0 ? collator.compare(a.label, b.label) : cmp * direction;
    });
  } else if (group === 'year') {
    groups.sort((a, b) => collator.compare(b.key, a.key));
    if (order === 'asc') groups.reverse();
  } else if (
    (group === 'producer' && sort === 'producer') ||
    (group === 'publisher' && sort === 'publisher') ||
    group === 'series' ||
    group === 'tag' ||
    group === 'aspect' ||
    group === 'place' ||
    group === 'edition'
  ) {
    groups.sort((a, b) => collator.compare(a.label, b.label));
    if (order === 'desc') groups.reverse();
  } else {
    groups.sort((a, b) => {
      const cmp = b.items.length - a.items.length;
      return order === 'asc' ? -cmp : cmp;
    });
  }
  const otherIdx = groups.findIndex((g) => g.key === '__none__');
  if (otherIdx !== -1) {
    const [other] = groups.splice(otherIdx, 1);
    groups.push(other);
  }
  return groups;
}

function latestReleased(items: CollectionItem[]): string {
  let latest = '';
  for (const item of items) {
    if (item.released && item.released > latest) latest = item.released;
  }
  return latest;
}

/**
 * Collapsible drawer for the long tail of library filters
 * (developer / publisher / series / aspect / dumped / tri-state
 * MoreFilters). Closed by default so the primary toolbar stays
 * compact. The button badge surfaces the active count so the user
 * knows the drawer is hiding live filters.
 */
function AdvancedFiltersDrawer({
  activeCount,
  onOpen,
  t,
  children,
}: {
  activeCount: number;
  onOpen: () => void;
  t: ReturnType<typeof useT>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  // Open the drawer when something elsewhere on the toolbar asks
  // for it — currently the SavedFilters empty popover dispatches
  // `vn:open-advanced-filters` so its empty state remains
  // actionable instead of looking like a no-op click.
  useEffect(() => {
    function handle() {
      setOpen(true);
      onOpen();
    }
    window.addEventListener('vn:open-advanced-filters', handle);
    return () => window.removeEventListener('vn:open-advanced-filters', handle);
  }, [onOpen]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => {
          const next = !value;
          if (next) onOpen();
          return next;
        })}
        aria-expanded={open}
        aria-controls={drawerId}
        data-shortcut="lib-filter"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          activeCount > 0
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
        }`}
      >
        <Filter className="h-3.5 w-3.5" aria-hidden />
        <span>{t.library.advancedFilters}</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-accent/30 px-1.5 text-[10px] font-bold">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={drawerId} className="mt-2 w-full space-y-3 rounded-lg border border-border bg-bg-card/60 p-3">
          {children}
        </div>
      )}
    </>
  );
}

/**
 * Removable active-filter chip. Renders below the toolbar so the
 * user can see at a glance which filters are live without having
 * to open the drawer.
 */
function FilterChip({
  icon,
  label,
  onClear,
  t,
}: {
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent hover:border-status-dropped hover:bg-status-dropped/10 hover:text-status-dropped"
      title={t.library.clearFilters}
    >
      {icon}
      <span className="max-w-[160px] truncate" title={label}>{label}</span>
      <X className="h-2.5 w-2.5 opacity-70" aria-hidden />
    </button>
  );
}

/**
 * Compact ⋯ Options/Actions menu on the Library search row.
 *
 * Per the user's two-level toolbar spec, the search row carries
 * status chips + search + Filtres + Options — and nothing else.
 * The Options menu is the single canonical surface for:
 *   - Préréglages (opens the SavedFilters popover via the
 *     SAVED_FILTERS_OPEN_EVENT bus)
 *   - Enregistrer le préréglage actuel (same bus, with
 *     `detail.action = 'save'` so SavedFilters flips into name-
 *     input mode)
 *   - Mise en page de l'accueil (opens the HomeLayoutEditor
 *     dialog via HOME_LAYOUT_OPEN_EVENT — replaces the rejected
 *     floating icon at the top of `/`)
 *   - Réinitialiser les filtres (calls clearAll, disabled when
 *     no filters are active so the menu item never looks like
 *     a live affordance against empty state)
 *
 * All four items dispatch CustomEvents instead of accepting
 * inline callbacks where the upstream surface (SavedFilters
 * popover, HomeLayoutEditor dialog) already owns its own state —
 * the bus is the documented "Versioned JSON config pattern"
 * convention in CLAUDE.md.
 */
function LibraryActionsMenu({
  hasFilters,
  onResetFilters,
  t,
}: {
  hasFilters: boolean;
  onResetFilters: () => void;
  t: ReturnType<typeof useT>;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const firstItem = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    firstItem?.focus({ preventScroll: true });
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (e.key === 'Home') next = items[0];
      else if (e.key === 'End') next = items[items.length - 1];
      else if (e.key === 'ArrowDown') next = items[(idx + 1 + items.length) % items.length];
      else next = items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  function dispatch(name: string, detail?: unknown) {
    window.dispatchEvent(
      detail !== undefined
        ? new CustomEvent(name, { detail })
        : new CustomEvent(name),
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={t.library.toolbarOptionsLabel}
        title={t.library.toolbarOptionsLabel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          open
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
        }`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        <span>{t.library.toolbarOptions}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.library.toolbarOptionsLabel}
          className="absolute right-0 top-full z-30 mt-1 w-[min(92vw,16rem)] rounded-lg border border-border bg-bg-card p-1 text-xs shadow-card"
        >
          <LibraryActionsMenuItem
            icon={<Bookmark className="h-3.5 w-3.5" aria-hidden />}
            label={t.savedFilters.title}
            onClick={() => {
              setOpen(false);
              dispatch(SAVED_FILTERS_OPEN_EVENT);
            }}
          />
          <LibraryActionsMenuItem
            icon={<BookmarkPlus className="h-3.5 w-3.5" aria-hidden />}
            label={t.library.saveCurrentPreset}
            onClick={() => {
              setOpen(false);
              dispatch(SAVED_FILTERS_OPEN_EVENT, { action: 'save' });
            }}
          />
          <LibraryActionsMenuItem
            icon={<LayoutTemplate className="h-3.5 w-3.5" aria-hidden />}
            label={t.homeLayout.openEditor}
            onClick={() => {
              setOpen(false);
              dispatch(HOME_LAYOUT_OPEN_EVENT);
            }}
          />
          <div className="my-1 border-t border-border/60" aria-hidden />
          <LibraryActionsMenuItem
            icon={<FilterX className="h-3.5 w-3.5" aria-hidden />}
            label={t.library.resetFilters}
            onClick={() => {
              setOpen(false);
              onResetFilters();
            }}
            disabled={!hasFilters}
          />
        </div>
      )}
    </div>
  );
}

function LibraryActionsMenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-white/90 hover:bg-bg-elev hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/90"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1 truncate" title={label}>{label}</span>
    </button>
  );
}

/**
 * Mobile-only expandable panel for the sort / group / order /
 * custom-sort / density / select / random / bulk-download controls.
 * Rendered below `sm`; the desktop toolbar row owns the same
 * controls at `sm:` and up. Closed by default so the cramped phone
 * layout collapses behind one trigger. Follows the same
 * toggle-panel idiom as `AdvancedFiltersDrawer` — the trigger is
 * focusable, Escape closes the panel and returns focus to the
 * trigger, and the controls stack full-width so none is hidden or
 * shrunk away on a phone.
 */
function LibraryToolbarDrawer({
  t,
  children,
}: {
  t: ReturnType<typeof useT>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return (
    <div className="mb-6 border-t border-border/60 pt-4 sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-2 text-xs transition-colors ${
          open
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          <span>{t.library.sortAndViewOptions}</span>
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={t.library.sortAndViewOptionsLabel}
          className="mt-2 flex flex-col items-stretch gap-3 rounded-lg border border-border bg-bg-card/60 p-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}
