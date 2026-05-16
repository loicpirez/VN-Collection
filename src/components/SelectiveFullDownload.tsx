'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CloudDownload, Loader2, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface CollectionRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  status: string | null;
  rating: number | null;
  user_rating: number | null;
  playtime_minutes: number | null;
  added_at: number | null;
  updated_at: number | null;
  /** True when staff_full / char_full are cached for this VN's main contributors. */
  full_downloaded?: boolean;
}

type SortKey = 'title' | 'added_at' | 'updated_at' | 'released' | 'rating' | 'user_rating' | 'playtime' | 'status';
type SortOrder = 'asc' | 'desc';

/** All sort keys we expose, in the order they should appear in the dropdown. */
const SORT_KEYS: SortKey[] = ['title', 'added_at', 'updated_at', 'released', 'rating', 'user_rating', 'playtime', 'status'];

/** Default direction per key (most often what the user wants). */
const DEFAULT_ORDER: Record<SortKey, SortOrder> = {
  title: 'asc',
  added_at: 'desc',
  updated_at: 'desc',
  released: 'desc',
  rating: 'desc',
  user_rating: 'desc',
  playtime: 'desc',
  status: 'asc',
};

/**
 * Optional filter context passed in by callers that already know what the
 * user is looking at — typically the library page, where the user's
 * current URL filters narrow the candidate list before they pick. When
 * omitted, the picker shows the full collection (legacy /data behaviour).
 */
export interface SelectiveDownloadFilters {
  status?: string;
  producer?: string;
  publisher?: string;
  series?: string;
  tag?: string;
  place?: string;
  yearMin?: string;
  yearMax?: string;
  dumped?: string;
  q?: string;
}

interface Props {
  /**
   * Pre-narrow the candidate list to match a parent's URL filters. The
   * server-side /api/collection endpoint already validates each param, so
   * we just forward them as-is.
   */
  defaultFilters?: SelectiveDownloadFilters;
  /** Pre-check a subset of VN ids when the modal opens. */
  defaultSelected?: Set<string>;
  /** Fired after a successful POST /api/collection/full-download. */
  onSubmitDone?: (queuedCount: number) => void;
}

/**
 * Selective full-download UI. Lists every VN in the collection with a
 * checkbox; the user picks which VNs to fan-out staff / characters /
 * developers for. Select-all / select-none / invert helpers + a text
 * filter. The actual queueing goes through POST /api/collection/full-
 * download, which bypasses the global auto-fan-out toggle.
 *
 * Rate-control is handled by lib/vndb-throttle.ts (1 req/s + per-request
 * Retry-After + soft 3-in-60s circuit) — picking 200 VNs is safe, it
 * just takes longer to drain through the queue.
 *
 * Two render contexts:
 *   - /data page: rendered inline with no props (loads the full
 *     collection so the user can scope the operation themselves).
 *   - / library page: rendered inside <Dialog> by BulkDownloadButton
 *     with `defaultFilters` from the current URL, so the picker already
 *     matches what the user can see in the grid behind the modal.
 */
export function SelectiveFullDownload({ defaultFilters, defaultSelected, onSubmitDone }: Props = {}) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(defaultSelected ?? []));
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [submitting, setSubmitting] = useState(false);

  // Stringify filters so the load callback only re-fires when the actual
  // values change, not on every parent re-render that recreates the
  // filters object identity.
  const filtersKey = useMemo(
    () => JSON.stringify(defaultFilters ?? {}),
    [defaultFilters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Build query string from defaultFilters; /api/collection validates
      // each param, so we don't filter here. `sort=title` keeps the
      // initial order deterministic regardless of the user's library
      // sort — they re-sort client-side below if needed.
      const params = new URLSearchParams({ sort: 'title' });
      if (defaultFilters) {
        for (const [k, v] of Object.entries(defaultFilters)) {
          if (v && typeof v === 'string') params.set(k, v);
        }
      }
      const r = await fetch(`/api/collection?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { items?: CollectionRow[] };
      const list = (data.items ?? []).filter((it) => /^v\d+$/i.test(it.id));
      setRows(list);
    } catch (e) {
      toast.error((e as Error).message || t.common.error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, t.common.error, toast]);

  function setSort(next: SortKey) {
    if (next === sortKey) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(next);
      setSortOrder(DEFAULT_ORDER[next]);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.alttitle ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase() === q,
    );
  }, [rows, filter]);

  /**
   * Compare two rows under the current sort key. Returns
   * positive when `a` should sort AFTER `b`, negative for before, zero
   * when equal. `desc` is applied as a final flip.
   */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const numericKey = (r: CollectionRow): number | null => {
      switch (sortKey) {
        case 'added_at': return r.added_at;
        case 'updated_at': return r.updated_at;
        case 'rating': return r.rating;
        case 'user_rating': return r.user_rating;
        case 'playtime': return r.playtime_minutes;
        default: return null;
      }
    };
    const stringKey = (r: CollectionRow): string => {
      switch (sortKey) {
        case 'title': return (r.title ?? '').toLowerCase();
        case 'released': return r.released ?? '';
        case 'status': return r.status ?? '~'; // null statuses sort last
        default: return '';
      }
    };
    const isNumeric = ['added_at', 'updated_at', 'rating', 'user_rating', 'playtime'].includes(sortKey);
    arr.sort((a, b) => {
      let cmp: number;
      if (isNumeric) {
        const av = numericKey(a);
        const bv = numericKey(b);
        // Nulls sort last regardless of direction so they don't drift to the top.
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = 1;
        else if (bv == null) cmp = -1;
        else cmp = av - bv;
      } else {
        cmp = stringKey(a).localeCompare(stringKey(b));
      }
      // Stable secondary tie-break by title so the order isn't ambiguous.
      if (cmp === 0) cmp = (a.title ?? '').localeCompare(b.title ?? '');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortOrder]);

  const allFilteredPicked = sorted.length > 0 && sorted.every((r) => picked.has(r.id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(r.id);
      return next;
    });
  }

  function selectNone() {
    setPicked(new Set());
  }

  function invertFiltered() {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (next.has(r.id)) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  async function submit() {
    if (picked.size === 0) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/collection/full-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_ids: Array.from(picked) }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { queued?: number };
      const queued = data.queued ?? 0;
      toast.success(t.selectiveFullDownload.queued.replace('{n}', String(queued)));
      setPicked(new Set());
      onSubmitDone?.(queued);
    } catch (e) {
      toast.error((e as Error).message || t.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-[11px] text-muted">{t.selectiveFullDownload.hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.selectiveFullDownload.searchPlaceholder}
            className="input w-full pl-7 text-xs"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="input w-auto py-1 text-xs"
          title={t.selectiveFullDownload.sortBy}
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {t.selectiveFullDownload.sortBy}: {t.selectiveFullDownload.sortKeys[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          title={sortOrder === 'asc' ? t.selectiveFullDownload.orderAsc : t.selectiveFullDownload.orderDesc}
          aria-label={sortOrder === 'asc' ? t.selectiveFullDownload.orderAsc : t.selectiveFullDownload.orderDesc}
        >
          {sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        </button>
        <button type="button" className="btn" onClick={selectAllFiltered} disabled={loading || filtered.length === 0}>
          {t.selectiveFullDownload.selectAll}
        </button>
        <button type="button" className="btn" onClick={selectNone} disabled={picked.size === 0}>
          {t.selectiveFullDownload.selectNone}
        </button>
        <button type="button" className="btn" onClick={invertFiltered} disabled={loading || filtered.length === 0}>
          {t.selectiveFullDownload.invert}
        </button>
        <span className="ml-auto text-[11px] text-muted">
          {picked.size} / {rows.length}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || picked.size === 0}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
          {t.selectiveFullDownload.runOnSelected.replace('{n}', String(picked.size))}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted">{t.common.loading}</p>
      ) : (
        // Min height keeps the toolbar from "popping" when the user
        // narrows the filter to nothing; max height adapts to the viewport
        // so the picker stays usable inside a Dialog on small screens.
        <ul className="max-h-[min(28rem,55vh)] min-h-32 overflow-y-auto rounded-md border border-border bg-bg-elev/30">
          {sorted.length === 0 ? (
            <li className="p-3 text-xs text-muted">{t.selectiveFullDownload.empty}</li>
          ) : (
            sorted.map((r) => {
              const isPicked = picked.has(r.id);
              return (
                <li
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0 ${
                    isPicked ? 'bg-accent/10' : 'hover:bg-bg-elev/50'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      isPicked ? 'border-accent bg-accent text-bg' : 'border-border'
                    }`}
                  >
                    {isPicked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{r.id}</span>
                  {r.released && <span className="shrink-0 text-[10px] text-muted">{r.released.slice(0, 4)}</span>}
                </li>
              );
            })
          )}
        </ul>
      )}
      <p className="text-[10px] text-muted">{t.selectiveFullDownload.rateNote}</p>
      {allFilteredPicked && filter && (
        <p className="text-[10px] text-accent">{t.selectiveFullDownload.allFilteredSelected}</p>
      )}
    </div>
  );
}
