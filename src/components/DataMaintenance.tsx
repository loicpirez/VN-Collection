'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { SkeletonRows } from './Skeleton';
import { ErrorAlert } from './ErrorAlert';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeMaintenanceDuplicateGroups,
  decodeMaintenanceStaleVns,
  type MaintenanceDuplicateGroup,
  type MaintenanceStaleVn,
} from '@/lib/data-operations-client-shape';

const STALE_PREVIEW_LIMIT = 50;

/**
 * "Maintenance" card on /data - surfaces duplicate candidates and rows whose
 * VNDB / EGS data is stale. Reads on mount, refreshes after every action.
 *
 * Both panes are read-only summaries; clean-up is one VN at a time:
 *   - Duplicate row → click the id to inspect, choose to delete.
 *   - Stale row    → "Refresh" hits the existing assets endpoint with
 *     refresh=true, re-fetching VNDB + EGS in the background.
 */
export function DataMaintenance() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [dups, setDups] = useState<MaintenanceDuplicateGroup[]>([]);
  const [stale, setStale] = useState<MaintenanceStaleVn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [showAllStale, setShowAllStale] = useState(false);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshingRef = useRef<string | null>(null);

  async function load() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    try {
      const [duplicateResponse, staleResponse] = await Promise.all([
        fetch('/api/maintenance/duplicates', { cache: 'no-store', signal }),
        fetch('/api/maintenance/stale', { cache: 'no-store', signal }),
      ]);
      if (!duplicateResponse.ok) throw new Error(await readApiError(duplicateResponse, t.common.error));
      if (!staleResponse.ok) throw new Error(await readApiError(staleResponse, t.common.error));
      const [groups, rows] = await Promise.all([
        duplicateResponse.json().then(decodeMaintenanceDuplicateGroups),
        staleResponse.json().then(decodeMaintenanceStaleVns),
      ]);
      if (!groups || !rows) throw new Error(t.common.error);
      if (signal.aborted || !mountedRef.current || loadAbortRef.current !== controller) return;
      setDups(groups);
      setStale(rows);
      setError(null);
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError' || !mountedRef.current || loadAbortRef.current !== controller) return;
      setError((e as Error).message || t.common.error);
    } finally {
      if (!signal.aborted && mountedRef.current && loadAbortRef.current === controller) setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      refreshingRef.current = null;
      loadAbortRef.current?.abort();
      refreshAbortRef.current?.abort();
    };
  }, []);

  async function refreshOne(id: string) {
    if (refreshingRef.current) return;
    const controller = new AbortController();
    refreshingRef.current = id;
    refreshAbortRef.current = controller;
    setRefreshing(id);
    try {
      const r = await fetch(`/api/collection/${id}/assets?refresh=true`, { method: 'POST', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      router.refresh();
      void load();
    } catch (e) {
      if (!mountedRef.current || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      refreshAbortRef.current = null;
      refreshingRef.current = null;
      if (mountedRef.current) setRefreshing(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <AlertTriangle className="h-5 w-5 text-accent" aria-hidden /> {t.maintenance.title}
      </h2>
      <p className="mb-4 text-xs text-muted">{t.maintenance.hint}</p>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonRows count={3} withThumb={false} />
          <SkeletonRows count={3} withThumb={false} />
        </div>
      ) : error ? (
        <ErrorAlert title={t.common.error}>
          {error}
          <button type="button" onClick={() => void load()} className="btn btn-sm mt-2">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.common.retry}
          </button>
        </ErrorAlert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted">
              <Copy className="h-3 w-3" aria-hidden /> {t.maintenance.dupTitle}
              <span className="ml-1 text-[10px]" aria-live="polite" aria-atomic="true">/ {dups.length}</span>
            </h3>
            {dups.length === 0 ? (
              <p className="text-xs text-muted">{t.maintenance.dupEmpty}</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {dups.map((g) => (
                  <li key={g.prefix} className="rounded-md border border-border bg-bg-elev/40 p-2">
                    <div className="mb-1 truncate font-mono text-[10px] text-muted" title={g.prefix}>{g.prefix}</div>
                    <div className="flex flex-wrap gap-1">
                      {g.ids.map((id) => (
                        <a key={id} href={`/vn/${id}`} className="inline-flex min-h-[44px] items-center rounded bg-bg-card px-1.5 py-0.5 text-[10px] hover:text-accent sm:min-h-0">
                          {id}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted">
              <RefreshCw className="h-3 w-3" aria-hidden /> {t.maintenance.staleTitle}
              <span className="ml-1 text-[10px]" aria-live="polite" aria-atomic="true">/ {stale.length}</span>
            </h3>
            {stale.length === 0 ? (
              <p className="text-xs text-muted">{t.maintenance.staleEmpty}</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {(showAllStale ? stale : stale.slice(0, STALE_PREVIEW_LIMIT)).map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-2 rounded-md border border-border bg-bg-elev/40 p-2">
                    <span className="min-w-0">
                      <Link href={`/vn/${s.id}`} className="inline-flex min-h-[44px] items-center truncate font-semibold hover:text-accent sm:min-h-0" title={s.title}>{s.title}</Link>
                      <span className="ml-1 text-[10px] text-muted">
                        {!s.has_cover && `/ ${t.maintenance.noCover}`}
                        {!s.has_egs && `/ ${t.maintenance.noEgs}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => refreshOne(s.id)}
                      disabled={refreshing !== null}
                      className="min-h-[44px] rounded-md border border-border bg-bg-card px-1.5 py-0.5 text-[10px] hover:border-accent hover:text-accent sm:min-h-0"
                    >
                      {refreshing === s.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : t.maintenance.refresh}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {stale.length > STALE_PREVIEW_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllStale((v) => !v)}
                className="btn btn-xs mt-3"
              >
                {showAllStale
                  ? t.steam.showLess
                  : `${t.steam.showAll} (${stale.length - STALE_PREVIEW_LIMIT})`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
