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
 * Selective full-download UI. Lists every VN in the collection with a
 * checkbox; the user picks which VNs to fan-out staff / characters /
 * developers for. Select-all / select-none / invert helpers + a text
 * filter. The actual queueing goes through POST /api/collection/full-
 * download, which bypasses the global auto-fan-out toggle.
 *
 * Rate-control is handled by lib/vndb-throttle.ts (1 req/s + per-request
 * Retry-After + soft 3-in-60s circuit) — picking 200 VNs is safe, it
 * just takes longer to drain through the queue.
 */
export function SelectiveFullDownload() {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Always pull title-sorted from the API; we sort client-side so the
      // user can flip keys without a round trip. No status param = all
      // VNs in the collection regardless of status.
      const r = await fetch('/api/collection?sort=title', { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { items?: CollectionRow[] };
      const list = (data.items ?? []).filter((it) => /^v\d+$/i.test(it.id));
      setRows(list);
    } catch (e) {
      toast.error((e as Error).message || t.common.error);
    } finally {
      setLoading(false);
    }
  }, [t.common.error, toast]);

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
      toast.success(t.selectiveFullDownload.queued.replace('{n}', String(data.queued ?? 0)));
      setPicked(new Set());
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
        <ul className="max-h-72 overflow-y-auto rounded-md border border-border bg-bg-elev/30">
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
