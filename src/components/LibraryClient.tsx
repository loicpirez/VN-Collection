'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Calendar, CheckSquare, ChevronDown, Filter, FilterX, GripVertical, HardDriveDownload, Home, LayoutGrid, Search, Tags as TagsIcon, X } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { SkeletonCardGrid } from './Skeleton';
import { StatusIcon } from './StatusIcon';
import { BulkDownloadButton } from './BulkDownloadButton';
import { BulkActionBar } from './BulkActionBar';
import { SortableGrid } from './SortableGrid';
import { RandomPickButton } from './RandomPickButton';
import { SavedFilters } from './SavedFilters';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { STATUSES, type Status } from '@/lib/types';
import type { CollectionItem, ProducerStat, SeriesRow, Stats } from '@/lib/types';

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

type GroupKey = 'none' | 'tag' | 'producer' | 'publisher' | 'status' | 'series';
const GROUP_KEYS: GroupKey[] = ['none', 'status', 'producer', 'publisher', 'tag', 'series'];

const Q_DEBOUNCE_MS = 300;

export function LibraryClient() {
  const t = useT();
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
  const urlYearMin = searchParams.get('yearMin') ?? '';
  const urlYearMax = searchParams.get('yearMax') ?? '';
  const urlDumped = searchParams.get('dumped') ?? '';
  const urlQ = searchParams.get('q') ?? '';
  // The default sort is configurable in Settings; we load it once and use it
  // as the fallback when the URL has no `sort` param.
  const [defaultSort, setDefaultSort] = useState<SortKey>('updated_at');
  useEffect(() => {
    let alive = true;
    fetch('/api/settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { default_sort?: string } | null) => {
        if (!alive || !d) return;
        if ((SORT_KEYS as readonly string[]).includes(d.default_sort ?? '')) {
          setDefaultSort(d.default_sort as SortKey);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const urlSort = searchParams.get('sort');
  const sort: SortKey = urlSort && (SORT_KEYS as readonly string[]).includes(urlSort)
    ? (urlSort as SortKey)
    : defaultSort;
  const order: 'asc' | 'desc' = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const group: GroupKey = (GROUP_KEYS as readonly string[]).includes(searchParams.get('group') ?? '')
    ? (searchParams.get('group') as GroupKey)
    : 'none';

  // Local input state for the search box, debounced to URL.
  const [qInput, setQInput] = useState(urlQ);
  useEffect(() => {
    setQInput(urlQ);
  }, [urlQ]);

  const replaceParams = useCallback(
    (mutator: (sp: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutator(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    },
    [router, searchParams],
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

  // Debounce the search input to URL
  useEffect(() => {
    if (qInput === urlQ) return;
    const handle = setTimeout(() => setParam('q', qInput.trim() || null), Q_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [qInput, urlQ, setParam]);

  const { settings, set } = useDisplaySettings();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byStatus: [], playtime_minutes: 0 });
  const [producers, setProducers] = useState<ProducerStat[]>([]);
  const [publishers, setPublishers] = useState<ProducerStat[]>([]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Gates the empty-state copy so we never flash "no results" before
  // at least one fetch has resolved. setLoading alone is not enough —
  // a fast 0-result response would still show the empty state before
  // the user sees the skeleton.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagName, setTagName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    fetch('/api/producers')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setProducers(d.producers ?? []);
        setPublishers(d.publishers ?? []);
      })
      .catch((e: Error) => {
        // Surface in the dev console so a silent dropdown failure
        // doesn't masquerade as an empty filter set.
        console.error('Failed to load producers/publishers list', e);
      });
    fetch('/api/series')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setSeries(d.series ?? []))
      .catch((e: Error) => console.error('Failed to load series list', e));
  }, []);

  // Resolve tag name when filtered by tag
  useEffect(() => {
    if (!urlTag) {
      setTagName(null);
      return;
    }
    setTagName(urlTag);
    fetch(`/api/tags?q=${encodeURIComponent(urlTag)}&results=1`)
      .then((r) => r.json())
      .then((d: { tags?: { id: string; name: string }[] }) => {
        const found = d.tags?.find((tag) => tag.id === urlTag);
        if (found) setTagName(found.name);
      })
      .catch(() => {});
  }, [urlTag]);

  useEffect(() => {
    // AbortController so rapid filter/sort/q changes cancel the
    // in-flight request — better-sqlite3 is synchronous and N JSON
    // parses per item make stacked requests genuinely expensive.
    const ctrl = new AbortController();
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
    if (urlYearMin) params.set('yearMin', urlYearMin);
    if (urlYearMax) params.set('yearMax', urlYearMax);
    if (urlDumped === '1' || urlDumped === '0') params.set('dumped', urlDumped);
    if (urlQ) params.set('q', urlQ);
    params.set('sort', sort);
    params.set('order', order);
    fetch(`/api/collection?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || t.common.error);
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setStats(data.stats);
        setHasLoadedOnce(true);
      })
      .catch((e: Error) => {
        if (!alive || e.name === 'AbortError') return;
        setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [status, producer, publisher, seriesId, urlTag, urlPlace, urlYearMin, urlYearMax, urlDumped, urlQ, sort, order, refreshKey, t.common.error]);

  function clearAll() {
    router.replace('/', { scroll: false });
    setQInput('');
  }

  const counts = useMemo(
    () => Object.fromEntries(stats.byStatus.map((s) => [s.status, s.n])) as Record<Status, number>,
    [stats],
  );
  const totalH = Math.round(stats.playtime_minutes / 60);
  const hasFilters =
    !!status || !!producer || !!publisher || !!seriesId || !!urlQ || !!urlTag || !!urlPlace || !!urlYearMin || !!urlYearMax || urlDumped === '1' || urlDumped === '0';
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
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('yearMin');
    sp.delete('yearMax');
    const qs = sp.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }

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
        if (settings.hideSexual && isAdult(it)) return false;
        if (!ternaryMatches(urlOnlyEgsOnly, it.id.startsWith('egs_'))) return false;
        if (!ternaryMatches(urlMatchVndb, !it.id.startsWith('egs_'))) return false;
        if (!ternaryMatches(urlMatchEgs, !!it.egs?.egs_id)) return false;
        if (!ternaryMatches(urlFanDisc, (it.relations ?? []).some((r) => r.relation === 'orig'))) return false;
        if (!ternaryMatches(urlHasNotes, !!(it.notes && it.notes.trim().length > 0))) return false;
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
    ],
  );
  const hiddenBySexualCount = items.length - visibleItems.length;
  const groups = useMemo(() => groupItems(visibleItems, group, t, sort, order), [visibleItems, group, t, sort, order]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          className={`chip whitespace-nowrap ${!status ? 'chip-active' : ''}`}
          onClick={() => setParam('status', null)}
        >
          {t.library.all} <span className="ml-1 opacity-70">{stats.total}</span>
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip inline-flex items-center gap-1 whitespace-nowrap ${status === s ? 'chip-active' : ''}`}
            onClick={() => setParam('status', status === s ? null : s)}
          >
            <StatusIcon status={s} className="h-3.5 w-3.5" />
            {t.status[s]}
            <span className="ml-1 opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
        <span className="ml-auto" />
        <SavedFilters />
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            data-vn-search
            className="input w-auto min-w-[180px]"
            placeholder={t.library.filterPlaceholder}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <select
            className="input w-auto"
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
            className="input w-auto"
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
            className="input w-auto"
            value={seriesId}
            onChange={(e) => setParam('series', e.target.value || null)}
            aria-label={t.library.filterBySeries}
          >
            <option value="">{t.library.filterBySeries}</option>
            {series.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          {urlTag && (
            <button
              type="button"
              onClick={() => setParam('tag', null)}
              className="chip chip-active inline-flex items-center gap-1.5"
              title={t.library.filterByTag}
            >
              <TagsIcon className="h-3.5 w-3.5" />
              <span className="max-w-[180px] truncate">{tagName ?? urlTag}</span>
              <X className="h-3 w-3 opacity-70 hover:opacity-100" aria-hidden />
            </button>
          )}
          {urlPlace && (
            <button
              type="button"
              onClick={() => setParam('place', null)}
              className="chip chip-active inline-flex items-center gap-1.5"
              title={t.library.filterByPlace}
            >
              <Home className="h-3.5 w-3.5" />
              <span className="max-w-[180px] truncate">{urlPlace}</span>
              <X className="h-3 w-3 opacity-70 hover:opacity-100" aria-hidden />
            </button>
          )}
          {yearLabel && (
            <button
              type="button"
              onClick={clearYear}
              className="chip chip-active inline-flex items-center gap-1.5"
              title={t.library.filterByYear}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{yearLabel}</span>
              <X className="h-3 w-3 opacity-70 hover:opacity-100" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const next = urlDumped === '1' ? '0' : urlDumped === '0' ? null : '1';
              setParam('dumped', next);
            }}
            className={`chip inline-flex items-center gap-1.5 whitespace-nowrap ${urlDumped ? 'chip-active' : ''}`}
            title={
              urlDumped === '1'
                ? t.library.filterDumpedYes
                : urlDumped === '0'
                  ? t.library.filterDumpedNo
                  : t.library.filterDumpedAll
            }
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            <span>
              {urlDumped === '1'
                ? t.library.filterDumpedYes
                : urlDumped === '0'
                  ? t.library.filterDumpedNo
                  : t.library.filterDumped}
            </span>
            {urlDumped && <X className="h-3 w-3 opacity-70 hover:opacity-100" aria-hidden />}
          </button>
          {hasFilters && (
            <button className="btn" onClick={clearAll} aria-label={t.library.clearFilters}>
              <FilterX className="h-4 w-4" /> {t.library.clearFilters}
            </button>
          )}
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
            ];
            replaceParams((sp) => {
              for (const k of keys) sp.delete(k);
            });
          }}
          t={t}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
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
        <button
          className="btn"
          onClick={() => setParam('order', order === 'asc' ? 'desc' : 'asc')}
          aria-label={order === 'asc' ? t.library.sortAsc : t.library.sortDesc}
          title={order === 'asc' ? t.library.sortAsc : t.library.sortDesc}
        >
          {order === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </button>
        {/* Quick toggle into / out of drag-reorder mode. Sets sort=custom which
            unlocks the SortableGrid; clicking again drops back to the prior
            sort (preserved via the default-sort setting). */}
        <button
          type="button"
          className={`btn inline-flex items-center gap-1 ${sort === 'custom' ? 'btn-primary' : ''}`}
          onClick={() => setParam('sort', sort === 'custom' ? null : 'custom')}
          title={t.library.customSortHint}
        >
          <GripVertical className="h-4 w-4" />
          {sort === 'custom' ? t.library.customSortExit : t.library.customSortEnter}
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
                  : t.library.groupStatus}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => set('denseLibrary', !settings.denseLibrary)}
            className={`btn ${settings.denseLibrary ? 'btn-primary' : ''}`}
            title={t.library.denseToggle}
          >
            <LayoutGrid className="h-4 w-4" /> {settings.denseLibrary ? t.library.denseOn : t.library.denseOff}
          </button>
          <div className="flex gap-6 text-sm text-muted">
            <span><b className="text-white">{stats.total}</b> {t.library.stats.vnCount}</span>
            <span><b className="text-white">{totalH}h</b> {t.library.stats.playedHours}</span>
          </div>
          {stats.total > 0 && (
            <button
              type="button"
              onClick={() => {
                if (selectMode) clearSelection();
                else setSelectMode(true);
              }}
              className={`btn ${selectMode ? 'btn-primary' : ''}`}
              title={t.bulkEdit.toggleSelectMode}
            >
              <CheckSquare className="h-4 w-4" /> {selectMode ? t.bulkEdit.exitSelectMode : t.bulkEdit.selectMode}
            </button>
          )}
          {visibleItems.length > 0 && (
            <RandomPickButton candidates={visibleItems.map((it) => ({ id: it.id, title: it.title }))} />
          )}
          {stats.total > 0 && <BulkDownloadButton onItemDone={() => setRefreshKey((k) => k + 1)} />}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

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
                onClick={async () => {
                  const ok = await confirm({
                    message: t.library.customSortReset,
                    tone: 'danger',
                  });
                  if (!ok) return;
                  try {
                    await fetch('/api/collection/order', { method: 'DELETE' });
                    setRefreshKey((k) => k + 1);
                  } catch {
                    // best-effort
                  }
                }}
                className="rounded border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] hover:border-accent hover:text-accent"
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
                  }).catch(() => {
                    // Best-effort — the next refresh will resync if it failed.
                  });
                }}
              />
            ) : (
              <Grid
                items={visibleItems}
                selectMode={selectMode}
                selected={selected}
                onToggle={toggleSelected}
                dense={settings.denseLibrary}
              />
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

      {selectMode && selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          onClear={clearSelection}
          onApplied={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

type FilterKey =
  | 'match_vndb'
  | 'match_egs'
  | 'only_egs_only'
  | 'fan_disc'
  | 'has_notes'
  | 'has_custom_cover'
  | 'has_banner'
  | 'is_favorite'
  | 'has_released'
  | 'is_nsfw'
  | 'is_nukige';

/**
 * Collapsible panel of tri-state filter checkboxes (off / only-yes / only-no).
 * Click cycles the value; each filter persists in the URL so the state
 * survives navigation. Filters read from URL params on render in LibraryClient.
 */
function MoreFilters({
  values,
  onCycle,
  onReset,
  t,
}: {
  values: Record<FilterKey, string | null>;
  onCycle: (key: FilterKey) => void;
  onReset: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'match_vndb', label: t.library.moreFilters.matchVndb },
    { key: 'match_egs', label: t.library.moreFilters.matchEgs },
    { key: 'only_egs_only', label: t.library.moreFilters.onlyEgsOnly },
    { key: 'fan_disc', label: t.library.moreFilters.fanDisc },
    { key: 'is_favorite', label: t.library.moreFilters.isFavorite },
    { key: 'has_notes', label: t.library.moreFilters.hasNotes },
    { key: 'has_custom_cover', label: t.library.moreFilters.hasCustomCover },
    { key: 'has_banner', label: t.library.moreFilters.hasBanner },
    { key: 'has_released', label: t.library.moreFilters.hasReleased },
    { key: 'is_nsfw', label: t.library.moreFilters.isNsfw },
    { key: 'is_nukige', label: t.library.moreFilters.isNukige },
  ];
  const activeCount = FILTERS.filter((f) => values[f.key] === '1' || values[f.key] === '0').length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-white"
      >
        <span className="inline-flex items-center gap-2">
          <Filter className="h-3 w-3" aria-hidden />
          {t.library.moreFilters.title}
          {activeCount > 0 && (
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] font-bold text-accent">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="mb-2 text-[10px] text-muted/80">{t.library.moreFilters.hint}</p>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(({ key, label }) => {
              const v = values[key];
              const active = v === '1' || v === '0';
              const tone = v === '1' ? 'yes' : v === '0' ? 'no' : 'off';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onCycle(key)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    tone === 'yes'
                      ? 'border-status-completed bg-status-completed/15 text-status-completed'
                      : tone === 'no'
                        ? 'border-status-dropped bg-status-dropped/15 text-status-dropped'
                        : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                  }`}
                  title={t.library.moreFilters.cycleHint}
                >
                  <span className="font-bold tabular-nums">
                    {tone === 'yes' ? '✓' : tone === 'no' ? '✗' : '○'}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="mt-3 text-[10px] text-muted hover:text-status-dropped"
            >
              {t.library.moreFilters.resetAll}
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const cls = dense
    ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
    : 'grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
  return (
    <div className={cls}>
      {items.map((it) => (
        <VnCard
          key={it.id}
          selectable={selectMode}
          selected={selected.has(it.id)}
          onSelect={() => onToggle?.(it.id)}
          data={toCardData(it)}
        />
      ))}
    </div>
  );
}

/**
 * Memoized projection from the heavy `CollectionItem` row to the
 * `CardData` props the card actually uses. WeakMap-cached on `it`
 * so the same input object always yields the same output object —
 * letting `React.memo(VnCard)` skip re-rendering when only an
 * unrelated parent state (filter query, etc.) ticks. Without this
 * the inline `data={{...}}` rebuilt on every render defeated the
 * memo entirely.
 */
const cardDataCache = new WeakMap<CollectionItem, CardData>();
function toCardData(it: CollectionItem): CardData {
  const cached = cardDataCache.get(it);
  if (cached) return cached;
  const data: CardData = {
    id: it.id,
    title: it.title,
    alttitle: it.alttitle,
    poster: it.image_url || it.image_thumb,
    localPoster: it.local_image || it.local_image_thumb,
    customCover: it.custom_cover,
    sexual: it.image_sexual,
    released: it.released,
    egs_median: it.egs?.median ?? null,
    egs_playtime_minutes: it.egs?.playtime_median_minutes ?? null,
    rating: it.rating,
    user_rating: it.user_rating,
    playtime_minutes: it.playtime_minutes,
    length_minutes: it.length_minutes,
    status: it.status as Status | undefined,
    favorite: it.favorite,
    developers: it.developers,
    publishers: it.publishers,
    isFanDisc: (it.relations ?? []).some((r) => r.relation === 'orig'),
  };
  cardDataCache.set(it, data);
  return data;
}

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
      // producer id, which was previously dumping every such VN into the
      // generic "Other" bucket and hiding the brand.
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
    }
  }
  // Group ordering policy:
  //   - Group axis matches sort axis (producer+producer, publisher+
  //     publisher): alphabetical by group label, honoring sort
  //     direction.
  //   - Series / tag groupings: always alphabetical (those axes
  //     don't have a corresponding numeric sort).
  //   - Everything else (status, publisher when sorted by something
  //     unrelated): biggest bucket first.
  // In all cases the "Other" bucket goes last.
  const groups = Array.from(map.values());
  const sortAlphabetical =
    (group === 'producer' && sort === 'producer') ||
    (group === 'publisher' && sort === 'publisher') ||
    group === 'series' ||
    group === 'tag';
  if (sortAlphabetical) {
    groups.sort((a, b) => a.label.localeCompare(b.label));
    if (order === 'desc') groups.reverse();
  } else {
    groups.sort((a, b) => b.items.length - a.items.length);
  }
  const otherIdx = groups.findIndex((g) => g.key === '__none__');
  if (otherIdx !== -1) {
    const [other] = groups.splice(otherIdx, 1);
    groups.push(other);
  }
  return groups;
}
