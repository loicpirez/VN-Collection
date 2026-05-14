'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CloudDownload, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Failure {
  id: string;
  message: string;
}

interface EgsWarning {
  kind: 'network' | 'server' | 'throttled' | 'blocked';
  count: number;
  lastStatus: number | null;
}

interface Props {
  onItemDone?: () => void;
}

export function BulkDownloadButton({ onItemDone }: Props = {}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const onLibrary = pathname === '/';
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [egsWarnings, setEgsWarnings] = useState<EgsWarning[]>([]);
  const [finished, setFinished] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'missing' | 'full'>('missing');

  async function runItems(items: { id: string; title: string }[], full: boolean) {
    setRunning(true);
    setFinished(false);
    setAborted(false);
    setError(null);
    setEgsWarnings([]);
    setDone(0);
    setTotal(items.length);
    setCurrentTitle(null);

    let abort = false;
    const onClickStop = () => { abort = true; };
    (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop = onClickStop;

    const local: Failure[] = [];
    const egsAgg = new Map<EgsWarning['kind'], EgsWarning>();
    try {
      for (let i = 0; i < items.length; i++) {
        if (abort) {
          setAborted(true);
          break;
        }
        const it = items[i];
        setCurrentTitle(it.title);
        try {
          const url = `/api/collection/${it.id}/assets${full ? '?refresh=true' : ''}`;
          const res = await fetch(url, { method: 'POST' });
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            egs_warning?: { kind: EgsWarning['kind']; status: number | null } | null;
          };
          if (!res.ok) {
            local.push({ id: it.id, message: body.error || `HTTP ${res.status}` });
          } else if (body.egs_warning) {
            const k = body.egs_warning.kind;
            const cur = egsAgg.get(k);
            egsAgg.set(k, {
              kind: k,
              count: (cur?.count ?? 0) + 1,
              lastStatus: body.egs_warning.status ?? cur?.lastStatus ?? null,
            });
            setEgsWarnings(Array.from(egsAgg.values()));
            if (k === 'blocked' || k === 'throttled') {
              abort = true;
            }
          }
        } catch (e) {
          local.push({ id: it.id, message: (e as Error).message });
        }
        setDone(i + 1);
        onItemDone?.();
      }
      setFailures(local);
      setEgsWarnings(Array.from(egsAgg.values()));
      setFinished(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setCurrentTitle(null);
      delete (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop;
    }
  }

  async function start(full: boolean) {
    setActiveMode(full ? 'full' : 'missing');
    setPickerOpen(false);
    setFailures([]);
    // Kick a one-shot global refresh first — pulls EGS anticipated,
    // VNDB stats / schema / authinfo, upcoming releases (collection +
    // all-VNDB). These don't belong to any VN so they're not covered
    // by the per-VN fan-out, and we want them fresh on a "Download
    // all" pass. Fire-and-forget; failures show in the download panel.
    void fetch('/api/refresh/global', { method: 'POST' }).catch(() => {});
    try {
      const r = await fetch('/api/collection?sort=title&order=asc', { cache: 'no-store' });
      if (!r.ok) throw new Error(t.common.error);
      const data = (await r.json()) as { items: { id: string; title: string }[] };
      await runItems(data.items, full);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }

  /**
   * Re-run the assets endpoint for VNs that failed in the previous pass.
   * Pulls fresh titles from /api/collection because the failure list only
   * holds ids. Forces `full=true` since failed items rarely benefit from
   * a "missing-only" retry.
   */
  async function retryFailed() {
    if (failures.length === 0) return;
    const failedIds = new Set(failures.map((f) => f.id));
    try {
      const r = await fetch('/api/collection?sort=title&order=asc', { cache: 'no-store' });
      if (!r.ok) throw new Error(t.common.error);
      const data = (await r.json()) as { items: { id: string; title: string }[] };
      const subset = data.items.filter((it) => failedIds.has(it.id));
      if (subset.length === 0) return;
      setFailures([]);
      await runItems(subset, true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stop() {
    const fn = (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop;
    fn?.();
  }

  function dismiss() {
    setFinished(false);
    setAborted(false);
    setError(null);
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          className="btn"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={running}
          title={t.bulk.tooltip}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
          {running ? `${done}/${total}` : t.bulk.cta}
        </button>
        {pickerOpen && !running && (
          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-bg-card p-2 text-xs shadow-card">
            <button
              type="button"
              onClick={() => start(false)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev"
            >
              <span className="inline-flex items-center gap-1 font-bold">
                <CloudDownload className="h-3.5 w-3.5 text-accent" />
                {t.bulk.missing}
              </span>
              <span className="text-[10px] text-muted">{t.bulk.missingHint}</span>
            </button>
            <button
              type="button"
              onClick={() => start(true)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev"
            >
              <span className="inline-flex items-center gap-1 font-bold">
                <RefreshCw className="h-3.5 w-3.5 text-accent" />
                {t.bulk.full}
              </span>
              <span className="text-[10px] text-muted">{t.bulk.fullHint}</span>
            </button>
          </div>
        )}
      </div>

      {onLibrary && (running || finished || aborted || error) && (
        <div className="fixed bottom-12 left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-4 shadow-card">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest text-muted">
                {running ? `${t.bulk.runningTitle} · ${activeMode === 'full' ? t.bulk.full : t.bulk.missing}` : aborted ? t.bulk.abortedTitle : finished ? t.bulk.doneTitle : t.common.error}
              </div>
              {currentTitle && running && (
                <div className="mt-1 truncate text-xs text-white/80">{currentTitle}</div>
              )}
              {!running && (
                <div className="mt-1 text-xs text-muted">
                  {done}/{total} · {failures.length > 0 ? `${failures.length} ${t.bulk.failures}` : t.bulk.allOk}
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:border-status-dropped hover:text-status-dropped"
                >
                  {t.bulk.stop}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
                  aria-label={t.common.close}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elev">
            <div
              className={`h-full transition-[width] duration-200 ${aborted ? 'bg-status-on_hold' : finished ? 'bg-status-completed' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {error && <p className="mt-2 text-xs text-status-dropped">{error}</p>}
          {egsWarnings.length > 0 && (
            <div className="mt-2 rounded-md border border-status-on_hold/30 bg-status-on_hold/10 p-2 text-[10px] text-status-on_hold">
              {egsWarnings.map((w) => (
                <div key={w.kind} className="flex items-baseline justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider">
                    {t.bulk.egsWarning[w.kind]}
                    {w.lastStatus != null && <span className="ml-1 opacity-70">{w.lastStatus}</span>}
                  </span>
                  <span>{w.count} {t.bulk.egsWarning.items}</span>
                </div>
              ))}
            </div>
          )}
          {failures.length > 0 && !running && (
            <>
              <button
                type="button"
                onClick={retryFailed}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-bold text-accent hover:bg-accent/20"
              >
                <RotateCcw className="h-3 w-3" />
                {t.bulk.retryFailed.replace('{n}', String(failures.length))}
              </button>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted hover:text-white">
                  {t.bulk.viewFailures} ({failures.length})
                </summary>
                <ul className="mt-1 max-h-32 overflow-y-auto text-[10px] text-status-dropped">
                  {failures.map((f) => (
                    <li key={f.id} className="truncate">{f.id}: {f.message}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}
    </>
  );
}
