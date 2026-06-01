'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Square, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { STOCK_PROVIDER_IDS, STOCK_PROVIDER_LABELS } from '@/lib/stock-provider-constants';
import { ErrorAlert } from './ErrorAlert';
import { VnSourcePicker, type VnPickerHit } from './VnSourcePicker';
import { readApiError } from '@/lib/api-error-read';
import {
  decodeDisabledStockProviders,
  decodeStockBatchQueuePage,
  decodeStockBatchStart,
} from '@/lib/stock-batch-client-shape';
import { decodeDownloadStatusSnapshot } from '@/lib/download-status-snapshot';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

const PROVIDER_GROUPS = {
  aggregator: ['eroge_price', 'getchu'] as string[],
  physical: ['sofmap', 'surugaya', 'hgame1', 'melonbooks', 'mandarake', 'wondergoo', 'trader', 'animate', 'gamers', 'geo', 'joshin', 'asakusa_mach', 'otakarasouko'] as string[],
  online: ['ebten', 'gamecity', 'amazon_jp', 'amiami', 'neowing', 'yodobashi', 'bikkuri_takarajima'] as string[],
} as const;

interface QueueEntry {
  vnId: string;
  title?: string;
}

const STOCK_BATCH_QUEUE_CAP = 5000;
const STOCK_BATCH_QUEUE_PAGE_SIZE = 50;
const STOCK_BATCH_SCOPE_PAGE_SIZE = 500;
const STOCK_BATCH_SCOPES = ['collection', 'reading_queue', 'recent_stock', 'wishlist'] as const;
type StockBatchScope = (typeof STOCK_BATCH_SCOPES)[number];

/**
 * Single queued VN entry. Memoized with a primitive prop signature and
 * a stable remove callback so adding entries or toggling the running
 * flag only re-renders the rows whose own props changed.
 */
const QueueRow = memo(function QueueRow({
  entry,
  running,
  t,
  onRemove,
}: {
  entry: QueueEntry;
  running: boolean;
  t: ReturnType<typeof useT>;
  onRemove: (vnId: string) => void;
}) {
  return (
    <li
      className="flex items-center justify-between gap-2 rounded border border-border bg-bg px-2 py-1 text-xs"
    >
      <span className="min-w-0 truncate text-white">{entry.title ?? entry.vnId}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted">{entry.vnId}</span>
      {!running && (
        <button
          type="button"
          onClick={() => onRemove(entry.vnId)}
          aria-label={t.common.delete as string}
          className="tap-target rounded p-0.5 text-muted hover:text-status-dropped"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </li>
  );
});

export function StockBatchClient() {
  const t = useT();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([...STOCK_PROVIDER_IDS]);
  const [queuePage, setQueuePage] = useState(1);
  const [loadingScopes, setLoadingScopes] = useState<Set<StockBatchScope>>(() => new Set());
  const activeScopeControllersRef = useRef(new Set<AbortController>());
  const activeScopesRef = useRef(new Set<StockBatchScope>());
  const mountedRef = useRef(true);
  const startInFlightRef = useRef(false);
  const startAbortRef = useRef<AbortController | null>(null);
  const stopInFlightRef = useRef(false);
  const stopAbortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings', { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const providers = decodeDisabledStockProviders(data);
        if (!providers) return;
        const disabled = new Set(providers);
        if (disabled.size === 0) return;
        if (!controller.signal.aborted) {
          setSelectedProviders(STOCK_PROVIDER_IDS.filter((id) => !disabled.has(id)));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controllers = activeScopeControllersRef.current;
    const scopes = activeScopesRef.current;
    return () => {
      for (const controller of controllers) controller.abort();
      controllers.clear();
      scopes.clear();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startAbortRef.current?.abort();
      stopAbortRef.current?.abort();
      startInFlightRef.current = false;
      stopInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const r = await fetch('/api/download-status', { cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const snapshot = decodeDownloadStatusSnapshot(await r.json());
        if (!snapshot) throw new Error(t.common.error);
        if (controller.signal.aborted || !mountedRef.current || jobIdRef.current !== jobId) return;
        const job = snapshot.jobs.find((entry) => entry.id === jobId);
        if (!job || job.finished_at != null) {
          jobIdRef.current = null;
          setJobId(null);
          setQueued(null);
          return;
        }
      } catch (e) {
        if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2_000);
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, t.common.error]);

  function toggleProvider(id: string) {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function addToQueue(entry: QueueEntry) {
    if (!isValidVnId(entry.vnId)) return;
    const vnId = normalizeVnId(entry.vnId);
    setQueue((prev) => {
      if (prev.some((q) => q.vnId === vnId)) return prev;
      if (prev.length >= STOCK_BATCH_QUEUE_CAP) {
        setError((t.stock.batchQueueCapacity as string).replace('{count}', String(STOCK_BATCH_QUEUE_CAP)));
        return prev;
      }
      return [...prev, { ...entry, vnId }];
    });
  }

  function handlePick(hit: VnPickerHit) {
    addToQueue({ vnId: hit.id, title: hit.title });
  }

  const removeFromQueue = useCallback((vnId: string) => {
    setQueue((prev) => prev.filter((q) => q.vnId !== vnId));
  }, []);

  function clearQueue() {
    if (startInFlightRef.current) return;
    for (const controller of activeScopeControllersRef.current) controller.abort();
    activeScopeControllersRef.current.clear();
    activeScopesRef.current.clear();
    setLoadingScopes(new Set());
    setQueue([]);
    setError(null);
  }

  async function loadScope(scope: StockBatchScope): Promise<void> {
    if (activeScopesRef.current.has(scope)) return;
    const controller = new AbortController();
    activeScopesRef.current.add(scope);
    activeScopeControllersRef.current.add(controller);
    setLoadingScopes((current) => new Set(current).add(scope));
    setError(null);
    try {
      const loaded: QueueEntry[] = [];
      let page: number | null = 1;
      let scopeHasMore = false;
      while (page !== null && loaded.length <= STOCK_BATCH_QUEUE_CAP) {
        const r = await fetch(`/api/stock/queue?scope=${scope}&page=${page}&page_size=${STOCK_BATCH_SCOPE_PAGE_SIZE}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok) {
          throw new Error(await readApiError(r, t.common.httpStatus.replace('{status}', String(r.status))));
        }
        const data = decodeStockBatchQueuePage(await r.json());
        if (!data) throw new Error(t.common.error);
        if (controller.signal.aborted) return;
        loaded.push(...data.entries);
        page = data.nextPage;
        scopeHasMore = page !== null;
      }
      if (controller.signal.aborted) return;
      setQueue((prev) => {
        const existing = new Set(prev.map((entry) => entry.vnId));
        const merged = [...prev];
        for (const entry of loaded) {
          if (existing.has(entry.vnId)) continue;
          if (merged.length >= STOCK_BATCH_QUEUE_CAP) {
            scopeHasMore = true;
            setError((t.stock.batchQueueCapacity as string).replace('{count}', String(STOCK_BATCH_QUEUE_CAP)));
            break;
          }
          existing.add(entry.vnId);
          merged.push(entry);
        }
        return merged;
      });
      if (scopeHasMore || loaded.length > STOCK_BATCH_QUEUE_CAP) {
        setError((t.stock.batchQueueCapacity as string).replace('{count}', String(STOCK_BATCH_QUEUE_CAP)));
      }
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof Error && e.message ? e.message : t.common.error);
    } finally {
      activeScopeControllersRef.current.delete(controller);
      activeScopesRef.current.delete(scope);
      if (!controller.signal.aborted) {
        setLoadingScopes((current) => {
          const next = new Set(current);
          next.delete(scope);
          return next;
        });
      }
    }
  }

  async function loadAllScopes() {
    if (activeScopesRef.current.size > 0) return;
    await loadScope('collection');
    await loadScope('wishlist');
  }

  async function run() {
    if (queue.length === 0 || startInFlightRef.current || jobIdRef.current != null || selectedProviders.length === 0) return;
    startInFlightRef.current = true;
    const controller = new AbortController();
    startAbortRef.current = controller;
    const vnIds = queue.map((entry) => entry.vnId);
    const providers = [...selectedProviders];
    setRunning(true);
    setError(null);
    setJobId(null);
    setQueued(null);
    try {
      const r = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vnIds, providers }),
        signal: controller.signal,
      });
      if (!r.ok) {
        throw new Error(await readApiError(r, t.common.httpStatus.replace('{status}', String(r.status))));
      }
      const data = decodeStockBatchStart(await r.json());
      if (!data) throw new Error(t.common.error);
      if (controller.signal.aborted || !mountedRef.current || startAbortRef.current !== controller) return;
      jobIdRef.current = data.jobId;
      setJobId(data.jobId);
      setQueued(data.queued);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof Error && e.message ? e.message : t.common.error);
    } finally {
      if (startAbortRef.current === controller) {
        startAbortRef.current = null;
        startInFlightRef.current = false;
        if (mountedRef.current) setRunning(false);
      }
    }
  }

  async function stop() {
    const ownerJobId = jobIdRef.current;
    if (!ownerJobId || stopInFlightRef.current) return;
    stopInFlightRef.current = true;
    const controller = new AbortController();
    stopAbortRef.current = controller;
    try {
      const r = await fetch(`/api/stock/batch?jobId=${encodeURIComponent(ownerJobId)}`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || stopAbortRef.current !== controller || jobIdRef.current !== ownerJobId) return;
      jobIdRef.current = null;
      setJobId(null);
      setQueued(null);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof Error && e.message ? e.message : t.common.error);
    } finally {
      if (stopAbortRef.current === controller) {
        stopAbortRef.current = null;
        stopInFlightRef.current = false;
      }
    }
  }

  const queueLabel = useMemo(
    () => (t.stock.batchQueueLabel as string).replace('{count}', String(queue.length)),
    [queue.length, t.stock.batchQueueLabel],
  );
  const queuePageCount = Math.max(1, Math.ceil(queue.length / STOCK_BATCH_QUEUE_PAGE_SIZE));
  const queuePageStart = (queuePage - 1) * STOCK_BATCH_QUEUE_PAGE_SIZE;
  const visibleQueue = queue.slice(queuePageStart, queuePageStart + STOCK_BATCH_QUEUE_PAGE_SIZE);

  useEffect(() => {
    setQueuePage((current) => Math.min(current, queuePageCount));
  }, [queuePageCount]);

  return (
    <div className="mt-5 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h2 className="text-base font-bold text-white">{t.stock.batchPageTitle as string}</h2>
      <p className="mt-1 text-sm text-muted">{t.stock.batchPageSubtitle as string}</p>

      <div className="mt-4 space-y-3">
        {/* Scope quick-add buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted">{t.stock.batchAddFrom as string}</span>
          {STOCK_BATCH_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => void loadScope(scope)}
              disabled={running || loadingScopes.has(scope)}
              aria-busy={loadingScopes.has(scope)}
              className="min-h-[44px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-[36px]"
            >
              {scope === 'collection' && (t.stock.batchScopeCollection as string)}
              {scope === 'reading_queue' && (t.stock.batchScopeReadingQueue as string)}
              {scope === 'recent_stock' && (t.stock.batchScopeStale as string)}
              {scope === 'wishlist' && (t.stock.batchScopeWishlist as string)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadAllScopes()}
            disabled={running || loadingScopes.size > 0}
            className="min-h-[44px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-[36px]"
          >
            {t.stock.batchScopeAll as string}
          </button>
        </div>

        {/* Provider filter */}
        <div>
          <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted">{t.stock.batchProviderFilter as string}</span>
          <div className="mb-1.5 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders([...STOCK_PROVIDER_IDS])}
              className="min-h-[44px] rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            >
              {t.stock.batchGroupAll as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders([])}
              className="min-h-[44px] rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            >
              {t.stock.batchGroupNone as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.aggregator.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="min-h-[44px] rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            >
              {t.stock.batchGroupAggregator as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.physical.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="min-h-[44px] rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            >
              {t.stock.batchGroupPhysical as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.online.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="min-h-[44px] rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            >
              {t.stock.batchGroupOnline as string}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {STOCK_PROVIDER_IDS.map((id) => {
              const active = selectedProviders.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={running}
                  onClick={() => toggleProvider(id)}
                  className={`min-h-[44px] rounded px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 sm:min-h-0 ${
                    active
                      ? 'border border-accent/60 bg-accent/20 text-accent'
                      : 'border border-border text-muted hover:border-accent/60 hover:text-accent'
                  }`}
                >
                  {STOCK_PROVIDER_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Autocomplete search across Library + VNDB + EGS */}
        <div>
          <label htmlFor="stock-batch-search" className="mb-1 block text-[11px] uppercase tracking-widest text-muted">
            {t.stock.batchSearchLabel as string}
          </label>
          <VnSourcePicker onPick={handlePick} disabled={running} showAddIcon />
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
                className="min-h-[44px] rounded px-2 text-[11px] text-muted hover:text-status-dropped disabled:opacity-50 sm:min-h-0"
              >
                {t.stock.batchQueueClear as string}
              </button>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {visibleQueue.map((entry) => (
                <QueueRow
                  key={entry.vnId}
                  entry={entry}
                  running={running}
                  t={t}
                  onRemove={removeFromQueue}
                />
              ))}
            </ul>
            {queuePageCount > 1 && (
              <nav
                aria-label={t.stock.batchQueuePaginationLabel as string}
                className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted"
              >
                <span>
                  {(t.stock.batchQueueRange as string)
                    .replace('{start}', String(queuePageStart + 1))
                    .replace('{end}', String(Math.min(queue.length, queuePageStart + visibleQueue.length)))
                    .replace('{total}', String(queue.length))}
                </span>
                <span>{(t.stock.batchQueuePage as string).replace('{current}', String(queuePage)).replace('{total}', String(queuePageCount))}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setQueuePage((current) => Math.max(1, current - 1))}
                    disabled={queuePage <= 1}
                    className="icon-btn tap-target disabled:opacity-40"
                    aria-label={t.stock.previousPage as string}
                    title={t.stock.previousPage as string}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueuePage((current) => Math.min(queuePageCount, current + 1))}
                    disabled={queuePage >= queuePageCount}
                    className="icon-btn tap-target disabled:opacity-40"
                    aria-label={t.stock.nextPage as string}
                    title={t.stock.nextPage as string}
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </nav>
            )}
          </div>
        )}

        {/* Job started confirmation */}
        {jobId && queued != null && (
          <div className="rounded-lg border border-status-completed/40 bg-status-completed/10 p-3 text-sm text-status-completed" role="status">
            {(t.stock.batchStarted as string).replace('{count}', String(queued))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {jobId && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-status-dropped/50 bg-status-dropped/10 px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/20"
            >
              <Square className="h-3.5 w-3.5" aria-hidden /> {t.stock.stop}
            </button>
          )}
          <button
            type="button"
            onClick={run}
            disabled={running || jobId != null || queue.length === 0 || selectedProviders.length === 0}
            className="btn btn-primary min-h-[44px]"
            aria-busy={running}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t.stock.batchRun as string}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}
    </div>
  );
}
