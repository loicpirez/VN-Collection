'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Plus, RefreshCw, Search, Square, X, XCircle } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface BatchResult {
  vnId: string;
  ok: boolean;
  offerCount?: number;
  error?: string;
  title?: string;
}

interface SearchHit {
  id: string;
  title: string;
  released?: string | null;
}

interface QueueEntry {
  vnId: string;
  title?: string;
}

const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export function StockBatchClient() {
  const t = useT();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null }>({ done: 0, total: 0, current: null });
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced library + VNDB search.
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const ctrl = new AbortController();
    debounceRef.current = setTimeout(async () => {
      try {
        // Prefer local collection matches first (fast), then VNDB search.
        const [libRes, vndbRes] = await Promise.all([
          fetch(`/api/collection/find?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctrl.signal }).then((r) => r.ok ? r.json() : { matches: [] }),
          fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctrl.signal }).then((r) => r.ok ? r.json() : { results: [] }),
        ]);
        if (ctrl.signal.aborted) return;
        const libHits = (libRes.matches ?? []) as SearchHit[];
        const vndbHits = (vndbRes.results ?? []) as SearchHit[];
        const seen = new Set<string>();
        const merged: SearchHit[] = [];
        for (const h of [...libHits, ...vndbHits]) {
          if (!h?.id || seen.has(h.id)) continue;
          seen.add(h.id);
          merged.push(h);
          if (merged.length >= 20) break;
        }
        setHits(merged);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { ctrl.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function addToQueue(entry: QueueEntry) {
    if (!VN_ID_RE.test(entry.vnId)) return;
    setQueue((prev) => (prev.some((q) => q.vnId === entry.vnId) ? prev : [...prev, entry]));
    setQuery('');
    setHits([]);
  }

  function removeFromQueue(vnId: string) {
    setQueue((prev) => prev.filter((q) => q.vnId !== vnId));
  }

  function clearQueue() {
    setQueue([]);
    setResults([]);
    setError(null);
  }

  async function loadScope(scope: 'collection' | 'reading_queue' | 'recent_stock') {
    setError(null);
    try {
      const r = await fetch(`/api/stock/queue?scope=${scope}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { ids: string[] };
      const ids = (data.ids ?? []).filter((id) => VN_ID_RE.test(id));
      const existing = new Set(queue.map((q) => q.vnId));
      const merged = [...queue, ...ids.filter((id) => !existing.has(id)).map((vnId) => ({ vnId }))];
      setQueue(merged);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run() {
    if (queue.length === 0 || running) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setError(null);
    setResults([]);
    setProgress({ done: 0, total: queue.length, current: null });
    const out: BatchResult[] = [];
    for (let i = 0; i < queue.length; i++) {
      if (ctrl.signal.aborted) break;
      const { vnId, title } = queue[i];
      setProgress({ done: i, total: queue.length, current: vnId });
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: ctrl.signal,
        });
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string };
          out.push({ vnId, title, ok: false, error: data.error ?? String(r.status) });
        } else {
          const data = (await r.json()) as { summary?: { total?: number } };
          out.push({ vnId, title, ok: true, offerCount: data.summary?.total ?? 0 });
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        out.push({ vnId, title, ok: false, error: (e as Error).message });
      }
      setResults([...out]);
      setProgress({ done: i + 1, total: queue.length, current: null });
    }
    if (abortRef.current === ctrl) abortRef.current = null;
    setRunning(false);
    setProgress((p) => ({ ...p, current: null }));
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }

  const queueLabel = useMemo(
    () => (t.stock.batchQueueLabel as string).replace('{count}', String(queue.length)),
    [queue.length, t.stock.batchQueueLabel],
  );

  return (
    <div className="mt-5 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h2 className="text-base font-bold text-white">{t.stock.batchPageTitle as string}</h2>
      <p className="mt-1 text-sm text-muted">{t.stock.batchPageSubtitle as string}</p>

      <div className="mt-4 space-y-3">
        {/* Scope quick-add buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted">{t.stock.batchAddFrom as string}</span>
          <button
            type="button"
            onClick={() => loadScope('collection')}
            disabled={running}
            className="min-h-[36px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t.stock.batchScopeCollection as string}
          </button>
          <button
            type="button"
            onClick={() => loadScope('reading_queue')}
            disabled={running}
            className="min-h-[36px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t.stock.batchScopeReadingQueue as string}
          </button>
          <button
            type="button"
            onClick={() => loadScope('recent_stock')}
            disabled={running}
            className="min-h-[36px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t.stock.batchScopeStale as string}
          </button>
        </div>

        {/* Autocomplete search */}
        <div>
          <label htmlFor="stock-batch-search" className="mb-1 block text-[11px] uppercase tracking-widest text-muted">
            {t.stock.batchSearchLabel as string}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="stock-batch-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.stock.batchSearchPlaceholder as string}
              aria-label={t.stock.batchSearchLabel as string}
              disabled={running}
              className="min-h-[40px] w-full rounded-lg border border-border bg-bg-elev py-2 pl-9 pr-3 text-sm text-white placeholder-muted focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </div>
          {searching && <p className="mt-1 text-[11px] text-muted">{t.common.loading}</p>}
          {hits.length > 0 && (
            <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-bg-elev/40">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => addToQueue({ vnId: hit.id, title: hit.title })}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{hit.title}</span>
                      <span className="block text-[10px] text-muted">{hit.id}{hit.released ? ` · ${hit.released}` : ''}</span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Queue display */}
        {queue.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-elev/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">{queueLabel}</h3>
              <button
                type="button"
                onClick={clearQueue}
                disabled={running}
                className="text-[11px] text-muted hover:text-status-dropped disabled:opacity-50"
              >
                {t.stock.batchQueueClear as string}
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto space-y-1">
              {queue.map((entry, i) => {
                const result = results.find((r) => r.vnId === entry.vnId);
                const isCurrent = running && progress.current === entry.vnId;
                const isPending = !result && i >= progress.done;
                return (
                  <li
                    key={entry.vnId}
                    className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${
                      isCurrent
                        ? 'border-accent/60 bg-accent/10'
                        : result?.ok
                          ? 'border-status-completed/40 bg-status-completed/10'
                          : result?.ok === false
                            ? 'border-status-dropped/40 bg-status-dropped/10'
                            : 'border-border bg-bg'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {isCurrent && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" aria-hidden />}
                      {result?.ok && <CheckCircle2 className="h-3 w-3 shrink-0 text-status-completed" aria-hidden />}
                      {result?.ok === false && <XCircle className="h-3 w-3 shrink-0 text-status-dropped" aria-hidden />}
                      <span className="min-w-0 truncate text-white">
                        {entry.title ?? entry.vnId}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">{entry.vnId}</span>
                    </span>
                    {result?.ok && (
                      <span className="shrink-0 rounded bg-status-completed/15 px-1.5 py-0.5 text-[10px] font-bold text-status-completed">
                        {(t.stock.batchOk as string).replace('{count}', String(result.offerCount ?? 0))}
                      </span>
                    )}
                    {result?.ok === false && (
                      <span className="shrink-0 truncate rounded bg-status-dropped/15 px-1.5 py-0.5 text-[10px] font-bold text-status-dropped" title={result.error ?? ''}>
                        {t.stock.batchError as string}
                      </span>
                    )}
                    {!result && isPending && !isCurrent && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(entry.vnId)}
                        aria-label={t.common.delete as string}
                        className="rounded p-0.5 text-muted hover:text-status-dropped focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-status-dropped/50 bg-status-dropped/10 px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/20"
            >
              <Square className="h-3.5 w-3.5" aria-hidden /> {t.stock.stop}
            </button>
          ) : null}
          <button
            type="button"
            onClick={run}
            disabled={running || queue.length === 0}
            className="btn btn-primary min-h-[44px]"
            aria-busy={running}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {running
              ? (t.stock.batchProgress as string)
                .replace('{done}', String(progress.done))
                .replace('{total}', String(progress.total))
              : (t.stock.batchRun as string)}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-3 text-sm text-status-dropped" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
