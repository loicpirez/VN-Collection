'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, RefreshCw, Database } from 'lucide-react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { SkeletonBlock } from './Skeleton';
import { ErrorAlert } from './ErrorAlert';
import { useT, useLocale } from '@/lib/i18n/client';
import { fmtDate, fmtNum } from '@/lib/locale-number';
import { useConfirm } from './ConfirmDialog';
import { readApiError } from '@/lib/api-error-read';
import { decodeCacheStatsResponse, type CacheStat } from '@/lib/cache-client-shape';

function bytes(n: number, locale: Locale): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${fmtNum(n / 1024, locale, 1)} kB`;
  return `${fmtNum(n / 1024 / 1024, locale, 2)} MB`;
}

function fmtTime(ts: number | null, locale: Locale): string {
  if (!ts) return '-';
  return fmtDate(new Date(ts), locale);
}

export function CachePanel() {
  const t = useT();
  const locale = useLocale();
  const { confirm } = useConfirm();
  const panelId = useId();
  const [stats, setStats] = useState<CacheStat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);
  const clearInFlightRef = useRef(false);
  const clearAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const { signal } = controller;
    try {
      const r = await fetch('/api/vndb/cache', { cache: 'no-store', signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const stats = decodeCacheStatsResponse(await r.json());
      if (!stats) throw new Error(t.common.error);
      if (signal.aborted || !mountedRef.current || loadAbortRef.current !== controller) return;
      setStats(stats);
      setError(null);
    } catch (e) {
      if (signal.aborted || (e as Error).name === 'AbortError') return;
      if (!mountedRef.current || loadAbortRef.current !== controller) return;
      setError((e as Error).message);
    }
  }, [t.common.error]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      clearInFlightRef.current = false;
      loadAbortRef.current?.abort();
      clearAbortRef.current?.abort();
      clearAbortRef.current = null;
    };
  }, [load]);

  async function clearAll(mode: 'all' | 'expired', needsConfirm = false) {
    if (clearInFlightRef.current) return;
    clearInFlightRef.current = true;
    const controller = new AbortController();
    clearAbortRef.current?.abort();
    clearAbortRef.current = controller;
    try {
      if (needsConfirm) {
        const ok = await confirm({ message: t.cache.clearConfirm, tone: 'danger' });
        if (!ok || !mountedRef.current || clearAbortRef.current !== controller || controller.signal.aborted) return;
      }
      setError(null);
      setClearing(true);
      const url = mode === 'all' ? '/api/vndb/cache' : '/api/vndb/cache?mode=expired';
      const r = await fetch(url, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || clearAbortRef.current !== controller || controller.signal.aborted) return;
      await load();
    } catch (e) {
      if (mountedRef.current && clearAbortRef.current === controller && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (clearAbortRef.current === controller) {
        clearAbortRef.current = null;
        clearInFlightRef.current = false;
        if (mountedRef.current) setClearing(false);
      }
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted" aria-hidden /> : <ChevronRight className="h-4 w-4 text-muted" aria-hidden />}
        <Database className="h-5 w-5 text-accent" aria-hidden />
        <span className="flex-1 text-lg font-bold">{t.cache.title}</span>
        {stats && (
          <span className="text-xs text-muted">
            {stats.total} {t.cache.entries}
          </span>
        )}
      </button>
      <div id={panelId}>
      {open && <p className="mb-4 mt-3 text-xs text-muted">{t.cache.subtitle}</p>}

      {open && error && (
        <div className="mb-3">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}

      {open && !stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : open && stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t.cache.entries} value={stats.total} locale={locale} />
            <Stat label={t.cache.fresh} value={stats.fresh} accent locale={locale} />
            <Stat label={t.cache.stale} value={stats.stale} locale={locale} />
            <Stat label={t.cache.size} value={bytes(stats.bytes, locale)} locale={locale} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-2">
            <div>{t.cache.oldest}: <span className="text-white">{fmtTime(stats.oldest, locale)}</span></div>
            <div>{t.cache.newest}: <span className="text-white">{fmtTime(stats.newest, locale)}</span></div>
          </div>

          {stats.by_path.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t.cache.byEndpoint}</h4>
              <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {stats.by_path.map((p) => (
                  <li key={p.path} className="flex justify-between rounded border border-border bg-bg-elev/40 px-3 py-1.5">
                    <span className="font-mono text-muted">{p.path}</span>
                    <span className="font-bold tabular-nums">{p.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => clearAll('expired')} disabled={clearing}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {t.cache.pruneExpired}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => clearAll('all', true)}
              disabled={clearing}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> {t.cache.clearAll}
            </button>
          </div>
        </>
      ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value, accent, locale }: { label: string; value: string | number; accent?: boolean; locale: Locale }) {
  const formatted = typeof value === 'number' ? fmtNum(value, locale) : value;
  return (
    <div className="rounded-lg border border-border bg-bg-elev/50 p-4 text-center">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ? 'text-accent' : ''}`}>{formatted}</div>
    </div>
  );
}
