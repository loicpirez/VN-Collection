'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompare, Loader2, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Dialog } from './Dialog';

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
 * The picker dialog uses the shared `<Dialog>` shell for ARIA/focus
 * management and renders each row as a real `<button>` so keyboard
 * users can Tab through and toggle with Space/Enter.
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
        <GitCompare className="h-4 w-4" aria-hidden /> {t.compareWith.cta}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.compareWith.title}
        description={t.compareWith.hint.replace('{n}', String(picked.size))}
        panelClassName="p-0 max-w-2xl"
      >
        <div className="relative border-b border-border p-3">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={filterRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.compareWith.searchPlaceholder}
            aria-label={t.compareWith.searchPlaceholder}
            className="input w-full pl-7 text-xs"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <ul className="p-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="mb-1 h-6 animate-pulse rounded bg-bg-elev/40" />
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted">{t.compareWith.empty}</p>
          ) : (
            <ul role="list">
              {filtered.map((r) => {
                const isPicked = picked.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      aria-pressed={isPicked}
                      className={`tap-target flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-xs ${
                        isPicked ? 'bg-accent/10' : 'hover:bg-bg-elev/50'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          isPicked ? 'border-accent bg-accent text-bg' : 'border-border'
                        }`}
                        aria-hidden
                      >
                        {isPicked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">{r.id}</span>
                      {r.released && <span className="shrink-0 text-[10px] text-muted">{r.released.slice(0, 4)}</span>}
                    </button>
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
            {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <GitCompare className="h-3 w-3" aria-hidden />}
            {t.compareWith.go.replace('{n}', String(picked.size + 1))}
          </button>
        </footer>
      </Dialog>
    </>
  );
}
