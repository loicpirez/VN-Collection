'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompare, Loader2, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface CollectionRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

/**
 * Single-shot "Compare with…" button shown on /vn/[id]. Click → modal
 * lists every other VN in the collection with a checkbox (1–3 selectable
 * — the current VN counts as one of the four /compare can handle).
 * Hitting "Compare" navigates to /compare?ids=current,picked1,picked2…
 *
 * Solves the previous discoverability problem where the only entry to
 * /compare was the multi-select Bulk Action Bar.
 */
export function CompareWithButton({ currentVnId }: { currentVnId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/collection?sort=released&order=desc', { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as { items?: CollectionRow[] };
      setRows((data.items ?? []).filter((it) => it.id !== currentVnId));
    } finally {
      setLoading(false);
    }
  }, [currentVnId]);

  useEffect(() => {
    if (!open) return;
    load();
    setTimeout(() => filterRef.current?.focus(), 50);
  }, [open, load]);

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

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  function go() {
    if (picked.size === 0) return;
    const ids = [currentVnId, ...Array.from(picked)];
    router.push(`/compare?ids=${encodeURIComponent(ids.join(','))}`);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn" title={t.compareWith.title}>
        <GitCompare className="h-4 w-4" /> {t.compareWith.cta}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(92vw,640px)] max-h-[80vh] overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card flex flex-col"
          >
            <header className="flex items-baseline justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="text-base font-bold">{t.compareWith.title}</h2>
                <p className="text-[11px] text-muted">{t.compareWith.hint.replace('{n}', String(picked.size))}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="text-muted hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="relative border-b border-border p-3">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
              <input
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t.compareWith.searchPlaceholder}
                className="input w-full pl-7 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-3 text-xs text-muted">{t.common.loading}</p>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-xs text-muted">{t.compareWith.empty}</p>
              ) : (
                <ul>
                  {filtered.map((r) => {
                    const isPicked = picked.has(r.id);
                    return (
                      <li
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        className={`flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs ${
                          isPicked ? 'bg-accent/10' : 'hover:bg-bg-elev/50'
                        }`}
                      >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${isPicked ? 'border-accent bg-accent text-bg' : 'border-border'}`}>
                          {isPicked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">{r.id}</span>
                        {r.released && <span className="shrink-0 text-[10px] text-muted">{r.released.slice(0, 4)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border p-3">
              <button type="button" onClick={() => setOpen(false)} className="btn">
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={go}
                disabled={picked.size === 0}
                className="btn btn-primary"
              >
                <GitCompare className="h-3 w-3" />
                {t.compareWith.go.replace('{n}', String(picked.size + 1))}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
