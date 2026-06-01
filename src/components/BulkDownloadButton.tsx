'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CheckSquare, CloudDownload, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Dialog } from './Dialog';
import { ErrorAlert } from './ErrorAlert';
import { SelectiveFullDownload, type SelectiveDownloadFilters } from './SelectiveFullDownload';
import { CollapsibleSummary } from './CollapsibleSummary';
import { fetchAllCollectionItems } from '@/lib/collection-api-client';

/** URL params the selective-download modal forwards to /api/collection. */
const FORWARDED_PARAMS = [
  'status',
  'producer',
  'publisher',
  'series',
  'tag',
  'place',
  'yearMin',
  'yearMax',
  'dumped',
  'q',
] as const;

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
  itemsOverride?: { id: string; title: string }[];
  label?: string;
}

export function BulkDownloadButton({ onItemDone, itemsOverride, label }: Props = {}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onLibrary = pathname === '/';
  const hasOverride = Array.isArray(itemsOverride);
  const menuId = useId();
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
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const bulkAbortRef = useRef<(() => void) | null>(null);

  // Pull the user's current library URL filters so the modal pre-narrows
  // to what's visible on screen. Outside the library page the dropdown is
  // still reachable from /data but we don't have filter context there, so
  // we just hand over an empty object.
  const selectiveFilters = useMemo<SelectiveDownloadFilters | undefined>(() => {
    if (!onLibrary) return undefined;
    const out: SelectiveDownloadFilters = {};
    for (const key of FORWARDED_PARAMS) {
      const v = searchParams.get(key);
      if (v) out[key] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }, [onLibrary, searchParams]);

  /**
   * Iterate the provided VN list and POST to `/api/collection/[id]/assets`
   * for each. The assets endpoint already runs `materializeReleaseMetaForVn`
   * server-side after the asset fetch completes, so the shelf popover /
   * owned-editions surfaces pick up freshly-derived per-edition platform
   * metadata once the bulk pass finishes — no extra client roundtrip
   * needed. `full=true` adds `?refresh=true` to also re-fetch VNDB.
   */
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
    bulkAbortRef.current = onClickStop;

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
      bulkAbortRef.current = null;
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
    void fetch('/api/refresh/global', { method: 'POST' }).catch((e: unknown) => { console.error('[BulkDownloadButton] global refresh failed:', e); });
    try {
      if (itemsOverride) {
        await runItems(itemsOverride, full);
        return;
      }
      const items = await fetchAllCollectionItems<{ id: string; title: string }>(
        new URLSearchParams({ sort: 'title', order: 'asc' }),
      );
      await runItems(items, full);
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
      if (itemsOverride) {
        const subset = itemsOverride.filter((it) => failedIds.has(it.id));
        if (subset.length === 0) return;
        setFailures([]);
        await runItems(subset, true);
        return;
      }
      const items = await fetchAllCollectionItems<{ id: string; title: string }>(
        new URLSearchParams({ sort: 'title', order: 'asc' }),
      );
      const subset = items.filter((it) => failedIds.has(it.id));
      if (subset.length === 0) return;
      setFailures([]);
      await runItems(subset, true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stop() {
    bulkAbortRef.current?.();
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
          disabled={running || (hasOverride && (itemsOverride?.length ?? 0) === 0)}
          title={t.bulk.tooltip}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          aria-controls={menuId}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CloudDownload className="h-4 w-4" />}
          {running ? `${done}/${total}` : (label ?? t.bulk.cta)}
        </button>
        {pickerOpen && !running && (
          <div
            id={menuId}
            role="menu"
            aria-label={t.bulk.cta}
            // Safety cap so a trigger near the right edge of a tight
            // mobile viewport can't push the panel off-screen.
            className="absolute right-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-card p-2 text-xs shadow-card"
          >
            <button
              type="button"
              role="menuitem"
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
              role="menuitem"
              onClick={() => start(true)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev"
            >
              <span className="inline-flex items-center gap-1 font-bold">
                <RefreshCw className="h-3.5 w-3.5 text-accent" />
                {t.bulk.full}
              </span>
              <span className="text-[10px] text-muted">{t.bulk.fullHint}</span>
            </button>
            {!hasOverride && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPickerOpen(false);
                  setSelectiveOpen(true);
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev"
              >
                <span className="inline-flex items-center gap-1 font-bold">
                  <CheckSquare className="h-3.5 w-3.5 text-accent" />
                  {t.bulk.selective}
                </span>
                <span className="text-[10px] text-muted">{t.bulk.selectiveHint}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={selectiveOpen}
        onClose={() => setSelectiveOpen(false)}
        title={t.selectiveFullDownload.title}
        description={
          onLibrary && selectiveFilters
            ? t.bulk.selectivePrefilledHint
            : t.selectiveFullDownload.subtitle
        }
        panelClassName="max-w-3xl p-4 sm:p-6"
      >
        <SelectiveFullDownload
          defaultFilters={selectiveFilters}
          onSubmitDone={() => {
            // Close on success so the progress lands on the
            // DownloadStatusBar without the modal hiding it.
            setSelectiveOpen(false);
          }}
        />
      </Dialog>

      {(onLibrary || hasOverride) && (running || finished || aborted || error) && (
        <div
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          className="fixed bottom-12 left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-4 shadow-card"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest text-muted">
                {running ? `${t.bulk.runningTitle} · ${activeMode === 'full' ? t.bulk.full : t.bulk.missing}` : aborted ? t.bulk.abortedTitle : finished ? t.bulk.doneTitle : t.common.error}
              </div>
              {currentTitle && running && (
                <div className="mt-1 truncate text-xs text-white/80" title={currentTitle}>{currentTitle}</div>
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
                  className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
                  aria-label={t.common.close}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.bulk.runningTitle}
            className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elev"
          >
            <div
              className={`h-full transition-[width] duration-200 ${aborted ? 'bg-status-on_hold' : finished ? 'bg-status-completed' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {error && <div className="mt-2"><ErrorAlert title={t.common.error}>{error}</ErrorAlert></div>}
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
              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-[11px] text-muted hover:text-white [&::-webkit-details-marker]:hidden">
                  <CollapsibleSummary>
                    {t.bulk.viewFailures} ({failures.length})
                  </CollapsibleSummary>
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
