'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Calendar, CheckSquare, FilterX, HardDriveDownload, Home, Search, Tags as TagsIcon, X } from 'lucide-react';
import { VnCard } from './VnCard';
import { StatusIcon } from './StatusIcon';
import { BulkDownloadButton } from './BulkDownloadButton';
import { BulkActionBar } from './BulkActionBar';
import { useT } from '@/lib/i18n/client';
import { STATUSES, type Status } from '@/lib/types';
import type { CollectionItem, ProducerStat, SeriesRow, Stats } from '@/lib/types';

type SortKey = 'updated_at' | 'added_at' | 'title' | 'rating' | 'user_rating' | 'playtime' | 'released' | 'producer';
const SORT_KEYS: SortKey[] = ['updated_at', 'added_at', 'title', 'rating', 'user_rating', 'playtime', 'released', 'producer'];

type GroupKey = 'none' | 'tag' | 'producer' | 'status' | 'series';
const GROUP_KEYS: GroupKey[] = ['none', 'status', 'producer', 'tag', 'series'];

const Q_DEBOUNCE_MS = 300;

export function LibraryClient() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive every filter / sort / group from the URL so they survive navigation.
  const status = (searchParams.get('status') ?? '') as Status | '';
  const producer = searchParams.get('producer') ?? '';
  const seriesId = searchParams.get('series') ?? '';
  const urlTag = searchParams.get('tag') ?? '';
  const urlPlace = searchParams.get('place') ?? '';
  const urlYearMin = searchParams.get('yearMin') ?? '';
  const urlYearMax = searchParams.get('yearMax') ?? '';
  const urlDumped = searchParams.get('dumped') ?? '';
  const urlQ = searchParams.get('q') ?? '';
  const sort = (SORT_KEYS as readonly string[]).includes(searchParams.get('sort') ?? '')
    ? (searchParams.get('sort') as SortKey)
    : 'updated_at';
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

  const [items, setItems] = useState<CollectionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byStatus: [], playtime_minutes: 0 });
  const [producers, setProducers] = useState<ProducerStat[]>([]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
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
    fetch('/api/producers').then((r) => r.json()).then((d) => setProducers(d.producers ?? [])).catch(() => {});
    fetch('/api/series').then((r) => r.json()).then((d) => setSeries(d.series ?? [])).catch(() => {});
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
    let alive = true;
    if (refreshKey === 0) setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (producer) params.set('producer', producer);
    if (seriesId) params.set('series', seriesId);
    if (urlTag) params.set('tag', urlTag);
    if (urlPlace) params.set('place', urlPlace);
    if (urlYearMin) params.set('yearMin', urlYearMin);
    if (urlYearMax) params.set('yearMax', urlYearMax);
    if (urlDumped === '1' || urlDumped === '0') params.set('dumped', urlDumped);
    if (urlQ) params.set('q', urlQ);
    params.set('sort', sort);
    params.set('order', order);
    fetch(`/api/collection?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || t.common.error);
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setStats(data.stats);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [status, producer, seriesId, urlTag, urlPlace, urlYearMin, urlYearMax, urlDumped, urlQ, sort, order, refreshKey, t.common.error]);

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
    !!status || !!producer || !!seriesId || !!urlQ || !!urlTag || !!urlPlace || !!urlYearMin || !!urlYearMax || urlDumped === '1' || urlDumped === '0';
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

  const groups = useMemo(() => groupItems(items, group, t), [items, group, t]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5 overflow-x-auto no-scrollbar">
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
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-auto min-w-[180px]"
            placeholder={t.library.filterPlaceholder}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <select
            className="input w-auto"
            value={producer}
            onChange={(e) => setParam('producer', e.target.value || null)}
            aria-label={t.library.filterByProducer}
          >
            <option value="">{t.library.filterByProducer}</option>
            {producers.map((p) => (
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
                {g === 'none' ? t.library.groupNone : g === 'tag' ? t.library.groupTag : g === 'producer' ? t.library.groupProducer : g === 'series' ? t.library.groupSeries : t.library.groupStatus}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3">
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
          {stats.total > 0 && <BulkDownloadButton onItemDone={() => setRefreshKey((k) => k + 1)} />}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-muted">{t.common.loading}</div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">{t.library.empty.title}</h2>
          <p className="mb-4 text-muted">{hasFilters ? t.library.empty.descriptionFiltered : t.library.empty.description}</p>
          <Link href="/search" className="btn btn-primary">
            <Search className="h-4 w-4" /> {t.library.empty.cta}
          </Link>
        </div>
      ) : group === 'none' ? (
        <Grid
          items={items}
          selectMode={selectMode}
          selected={selected}
          onToggle={toggleSelected}
        />
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
              />
            </section>
          ))}
        </div>
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

function Grid({
  items,
  selectMode = false,
  selected = new Set<string>(),
  onToggle,
}: {
  items: CollectionItem[];
  selectMode?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it) => (
        <VnCard
          key={it.id}
          selectable={selectMode}
          selected={selected.has(it.id)}
          onSelect={() => onToggle?.(it.id)}
          data={{
            id: it.id,
            title: it.title,
            alttitle: it.alttitle,
            poster: it.image_thumb || it.image_url,
            localPoster: it.local_image_thumb || it.local_image,
            customCover: it.custom_cover,
            sexual: it.image_sexual,
            released: it.released,
            rating: it.rating,
            user_rating: it.user_rating,
            playtime_minutes: it.playtime_minutes,
            length_minutes: it.length_minutes,
            status: it.status as Status | undefined,
            favorite: it.favorite,
            developers: it.developers,
          }}
        />
      ))}
    </div>
  );
}

interface Group {
  key: string;
  label: string;
  items: CollectionItem[];
}

function groupItems(items: CollectionItem[], group: GroupKey, t: ReturnType<typeof useT>): Group[] {
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
      const k = dev?.id ?? '__none__';
      const label = dev?.name ?? t.library.groupOther;
      if (!map.has(k)) map.set(k, { key: k, label, items: [] });
      map.get(k)!.items.push(it);
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
  return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
}
