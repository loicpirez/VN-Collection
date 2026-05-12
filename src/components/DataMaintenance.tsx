'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { SkeletonRows } from './Skeleton';

interface DupGroup {
  prefix: string;
  ids: string[];
}

interface StaleVn {
  id: string;
  title: string;
  fetched_at: number;
  has_cover: boolean;
  has_egs: boolean;
}

/**
 * "Maintenance" card on /data — surfaces duplicate candidates and rows whose
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
  const [dups, setDups] = useState<DupGroup[]>([]);
  const [stale, setStale] = useState<StaleVn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        fetch('/api/maintenance/duplicates').then((r) => r.json()),
        fetch('/api/maintenance/stale').then((r) => r.json()),
      ]);
      setDups((d as { groups: DupGroup[] }).groups);
      setStale((s as { rows: StaleVn[] }).rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function refreshOne(id: string) {
    setRefreshing(id);
    try {
      const r = await fetch(`/api/collection/${id}/assets?refresh=true`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      router.refresh();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-6">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <AlertTriangle className="h-5 w-5 text-accent" /> {t.maintenance.title}
      </h2>
      <p className="mb-4 text-xs text-muted">{t.maintenance.hint}</p>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonRows count={3} withThumb={false} />
          <SkeletonRows count={3} withThumb={false} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted">
              <Copy className="h-3 w-3" /> {t.maintenance.dupTitle}
              <span className="ml-1 text-[10px]">· {dups.length}</span>
            </h3>
            {dups.length === 0 ? (
              <p className="text-xs text-muted">{t.maintenance.dupEmpty}</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {dups.map((g) => (
                  <li key={g.prefix} className="rounded-md border border-border bg-bg-elev/40 p-2">
                    <div className="mb-1 truncate font-mono text-[10px] text-muted">{g.prefix}</div>
                    <div className="flex flex-wrap gap-1">
                      {g.ids.map((id) => (
                        <a key={id} href={`/vn/${id}`} className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] hover:text-accent">
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
              <RefreshCw className="h-3 w-3" /> {t.maintenance.staleTitle}
              <span className="ml-1 text-[10px]">· {stale.length}</span>
            </h3>
            {stale.length === 0 ? (
              <p className="text-xs text-muted">{t.maintenance.staleEmpty}</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {stale.slice(0, 50).map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-2 rounded-md border border-border bg-bg-elev/40 p-2">
                    <span className="min-w-0">
                      <a href={`/vn/${s.id}`} className="truncate font-semibold hover:text-accent">{s.title}</a>
                      <span className="ml-1 text-[10px] text-muted">
                        {!s.has_cover && `· ${t.maintenance.noCover}`}
                        {!s.has_egs && `· ${t.maintenance.noEgs}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => refreshOne(s.id)}
                      disabled={refreshing === s.id}
                      className="rounded-md border border-border bg-bg-card px-1.5 py-0.5 text-[10px] hover:border-accent hover:text-accent"
                    >
                      {refreshing === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.maintenance.refresh}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
