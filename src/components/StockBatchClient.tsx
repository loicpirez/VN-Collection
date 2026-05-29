'use client';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Square, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { STOCK_PROVIDER_IDS, STOCK_PROVIDER_LABELS } from '@/lib/stock-provider-constants';
import { VnSourcePicker, type VnPickerHit } from './VnSourcePicker';

const PROVIDER_GROUPS = {
  aggregator: ['eroge_price', 'getchu'] as string[],
  physical: ['sofmap', 'surugaya', 'hgame1', 'melonbooks', 'mandarake', 'wondergoo', 'trader', 'animate', 'gamers', 'geo', 'joshin', 'asakusa_mach', 'otakarasouko'] as string[],
  online: ['ebten', 'gamecity', 'amazon_jp', 'amiami', 'neowing', 'yodobashi', 'bikkuri_takarajima'] as string[],
} as const;

interface QueueEntry {
  vnId: string;
  title?: string;
}

const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export function StockBatchClient() {
  const t = useT();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([...STOCK_PROVIDER_IDS]);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stock_disabled_providers?: string[] } | null) => {
        if (!data) return;
        const disabled = new Set(data.stock_disabled_providers ?? []);
        if (disabled.size === 0) return;
        setSelectedProviders(STOCK_PROVIDER_IDS.filter((id) => !disabled.has(id)));
      })
      .catch(() => {});
  }, []);

  function toggleProvider(id: string) {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function addToQueue(entry: QueueEntry) {
    if (!VN_ID_RE.test(entry.vnId)) return;
    setQueue((prev) => (prev.some((q) => q.vnId === entry.vnId) ? prev : [...prev, entry]));
  }

  function handlePick(hit: VnPickerHit) {
    addToQueue({ vnId: hit.id, title: hit.title });
  }

  function removeFromQueue(vnId: string) {
    setQueue((prev) => prev.filter((q) => q.vnId !== vnId));
  }

  function clearQueue() {
    setQueue([]);
    setError(null);
    setJobId(null);
    setQueued(null);
  }

  async function loadScope(scope: 'collection' | 'reading_queue' | 'recent_stock' | 'wishlist') {
    setError(null);
    try {
      const r = await fetch(`/api/stock/queue?scope=${scope}`, { cache: 'no-store' });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t.common.httpStatus.replace('{status}', String(r.status)));
      }
      const data = (await r.json()) as {
        ids?: string[];
        entries?: Array<{ vn_id: string; title: string | null }>;
      };
      const entries = (data.entries ?? data.ids?.map((vn_id) => ({ vn_id, title: null })) ?? [])
        .filter((e) => VN_ID_RE.test(e.vn_id));
      const existing = new Set(queue.map((q) => q.vnId));
      const merged = [
        ...queue,
        ...entries
          .filter((e) => !existing.has(e.vn_id))
          .map((e) => ({ vnId: e.vn_id, title: e.title ?? undefined })),
      ];
      setQueue(merged);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }

  async function loadAllScopes() {
    await loadScope('collection').catch(() => {});
    await loadScope('wishlist').catch(() => {});
  }

  async function run() {
    if (queue.length === 0 || running || selectedProviders.length === 0) return;
    setRunning(true);
    setError(null);
    setJobId(null);
    setQueued(null);
    try {
      const r = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vnIds: queue.map((e) => e.vnId), providers: selectedProviders }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t.common.httpStatus.replace('{status}', String(r.status)));
      }
      const data = (await r.json()) as { jobId: string; queued: number };
      setJobId(data.jobId);
      setQueued(data.queued);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function stop() {
    if (!jobId) return;
    try {
      await fetch(`/api/stock/batch?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      setJobId(null);
    } catch {}
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
          {(['collection', 'reading_queue', 'recent_stock', 'wishlist'] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => loadScope(scope)}
              disabled={running}
              className="min-h-[36px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {scope === 'collection' && (t.stock.batchScopeCollection as string)}
              {scope === 'reading_queue' && (t.stock.batchScopeReadingQueue as string)}
              {scope === 'recent_stock' && (t.stock.batchScopeStale as string)}
              {scope === 'wishlist' && (t.stock.batchScopeWishlist as string)}
            </button>
          ))}
          <button
            type="button"
            onClick={loadAllScopes}
            disabled={running}
            className="min-h-[36px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
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
              className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t.stock.batchGroupAll as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders([])}
              className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t.stock.batchGroupNone as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.aggregator.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t.stock.batchGroupAggregator as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.physical.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t.stock.batchGroupPhysical as string}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setSelectedProviders(PROVIDER_GROUPS.online.filter((id) => (STOCK_PROVIDER_IDS as readonly string[]).includes(id)))}
              className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
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
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
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
                className="text-[11px] text-muted hover:text-status-dropped disabled:opacity-50"
              >
                {t.stock.batchQueueClear as string}
              </button>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {queue.map((entry) => (
                <li
                  key={entry.vnId}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-bg px-2 py-1 text-xs"
                >
                  <span className="min-w-0 truncate text-white">{entry.title ?? entry.vnId}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{entry.vnId}</span>
                  {!running && (
                    <button
                      type="button"
                      onClick={() => removeFromQueue(entry.vnId)}
                      aria-label={t.common.delete as string}
                      className="rounded p-0.5 text-muted hover:text-status-dropped"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
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
            disabled={running || queue.length === 0 || selectedProviders.length === 0}
            className="btn btn-primary min-h-[44px]"
            aria-busy={running}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t.stock.batchRun as string}
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
