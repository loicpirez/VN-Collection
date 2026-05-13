'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CloudDownload, Loader2, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface CollectionRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  status: string | null;
  /** True when staff_full / char_full are cached for this VN's main contributors. */
  full_downloaded?: boolean;
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
 */
export function SelectiveFullDownload() {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/collection?status=all&sort=title', { cache: 'no-store' });
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

  const allFilteredPicked = filtered.length > 0 && filtered.every((r) => picked.has(r.id));

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
          {filtered.length === 0 ? (
            <li className="p-3 text-xs text-muted">{t.selectiveFullDownload.empty}</li>
          ) : (
            filtered.map((r) => {
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
