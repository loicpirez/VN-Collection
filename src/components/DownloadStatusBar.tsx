'use client';
import { useEffect, useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudDownload, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface JobError {
  item: string;
  message: string;
}

interface Job {
  id: string;
  // Mirrors lib/download-status.ts `JobKind`. Keep in sync.
  kind:
    | 'staff'
    | 'characters'
    | 'producers'
    | 'vndb-pull'
    | 'egs-sync'
    | 'vn-fetch'
    | 'cache-refresh';
  vn_id: string | null;
  label: string;
  total: number;
  done: number;
  errors: JobError[];
  started_at: number;
  finished_at: number | null;
}

interface Snapshot {
  throttle: {
    active: number;
    queued: number;
    recent429s?: number;
    circuitOpen?: boolean;
    /** Server-provided ms-until-resume from the most recent Retry-After. */
    retryAfterMs?: number;
  };
  jobs: Job[];
}

/**
 * Sticky bottom-right indicator showing every in-flight VNDB fan-out job
 * plus the rate-limiter's current state (active / queued requests).
 *
 * Polling cadence:
 *   - Active jobs / throttled requests: every 4s.
 *   - Idle and the popover is closed: every 60s.
 *   - Page hidden (visibility API) or document not focused: pause entirely.
 *
 * The previous 1.5s active / 10s idle pace flooded the server log during a
 * bulk run (~40 GETs/min while the panel was hidden); the new pace keeps
 * the live progress feel without spamming.
 *
 * Hidden entirely when no jobs are tracked and nothing is in flight.
 */
export function DownloadStatusBar() {
  const t = useT();
  const [data, setData] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const [dismissedFinished, setDismissedFinished] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Server-Sent Events stream gives us push-style updates within
    // milliseconds of any job mutation, with no polling cost when
    // nothing is happening. If `EventSource` isn't available or the
    // connection errors repeatedly, we drop back to interval polling
    // so older browsers and odd proxy setups still get progress.
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let useSse = typeof window !== 'undefined' && 'EventSource' in window;

    async function pollOnce() {
      if (!alive) return;
      let next: Snapshot | null = null;
      try {
        const r = await fetch('/api/download-status', { cache: 'no-store' });
        if (r.ok) {
          next = (await r.json()) as Snapshot;
          if (alive) setData(next);
        }
      } catch {
        // Network blips are fine, retry on the next tick.
      }
      if (!alive) return;
      const active =
        (next?.jobs.some((j) => j.finished_at == null) ?? false) ||
        (next?.throttle.active ?? 0) > 0 ||
        (next?.throttle.queued ?? 0) > 0;
      // Slower cadence than the SSE event rate because polling is a
      // pure fallback for clients that lost the stream — we still
      // want updates, just not at high frequency.
      const delay = active ? 4_000 : 60_000;
      pollTimer = setTimeout(pollOnce, delay);
    }

    function startPolling() {
      if (pollTimer) clearTimeout(pollTimer);
      pollOnce();
    }

    function startSse() {
      try {
        es = new EventSource('/api/download-status/stream');
        es.onmessage = (e) => {
          if (!alive) return;
          try {
            setData(JSON.parse(e.data) as Snapshot);
          } catch {
            // Bad frame — ignore, the next one will be valid.
          }
        };
        es.onerror = () => {
          // Most reverse proxies hiccup at least once during cold
          // boot. The browser auto-reconnects, but if EventSource
          // gives up entirely (readyState=2 / CLOSED), we fall back
          // to interval polling so the user never loses progress.
          if (es && es.readyState === 2 && alive && useSse) {
            useSse = false;
            es.close();
            es = null;
            startPolling();
          }
        };
      } catch {
        useSse = false;
        startPolling();
      }
    }

    if (useSse) startSse();
    else startPolling();

    const onVisible = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      if (useSse) {
        // EventSource normally reconnects on its own when the tab
        // wakes up, but recreating ensures we get a fresh snapshot
        // immediately rather than waiting for the next event.
        if (es) es.close();
        startSse();
      } else {
        startPolling();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      alive = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (es) es.close();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);

  const live = data?.jobs.filter((j) => j.finished_at == null) ?? [];
  const visibleFinished = (data?.jobs.filter((j) => j.finished_at != null && !dismissedFinished.has(j.id)) ?? []).slice(0, 6);
  const totalErrors = (data?.jobs ?? []).reduce((acc, j) => acc + j.errors.length, 0);
  const activeReq = data?.throttle.active ?? 0;
  const queuedReq = data?.throttle.queued ?? 0;
  // Server reports how long the most recent Retry-After still has to run.
  // We tick a local 500ms timer so the countdown is smooth without
  // hitting /api/download-status every 500ms.
  const serverRetryAfterMs = data?.throttle.retryAfterMs ?? 0;
  const [localRetryMs, setLocalRetryMs] = useState(serverRetryAfterMs);
  useEffect(() => {
    setLocalRetryMs(serverRetryAfterMs);
    if (serverRetryAfterMs <= 0) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, serverRetryAfterMs - elapsed);
      setLocalRetryMs(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 500);
    return () => clearInterval(tick);
  }, [serverRetryAfterMs]);
  const retryingNow = localRetryMs > 0;
  const hasAnything = live.length > 0 || visibleFinished.length > 0 || activeReq > 0 || retryingNow;

  if (!hasAnything) return null;

  const labelKind = (k: Job['kind']): string =>
    k in t.downloadStatus.kinds ? t.downloadStatus.kinds[k as keyof typeof t.downloadStatus.kinds] : k;

  return (
    // Anchored bottom-right above the QuoteFooter (which lives at bottom-0
    // and grows to ~112px on hover — `bottom-32` clears the expanded
    // height). Popover opens upward so it stays inside the viewport.
    <div
      className="fixed bottom-5 right-2 z-40 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2 sm:right-4 sm:max-w-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {retryingNow && (
        <div className="rounded-md border border-status-on_hold/60 bg-status-on_hold/10 px-3 py-2 text-[11px] text-status-on_hold shadow-card">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3 w-3" />
            {t.downloadStatus.retrying}
          </div>
          <div className="text-[10px] opacity-90">
            {t.downloadStatus.retryCountdown.replace('{s}', String(Math.ceil(localRetryMs / 1000)))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`tap-target group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-card transition-colors ${
          retryingNow
            ? 'border-status-on_hold/60 bg-status-on_hold/15 text-status-on_hold'
            : live.length > 0
              ? 'border-accent bg-accent/15 text-accent'
              : totalErrors > 0
                ? 'border-status-dropped/50 bg-status-dropped/10 text-status-dropped'
                : 'border-border bg-bg-card text-muted hover:text-white'
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-label={t.downloadStatus.title}
      >
        {retryingNow ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : live.length > 0 ? (
          <CloudDownload className="h-3.5 w-3.5 animate-pulse" />
        ) : totalErrors > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Cloud className="h-3.5 w-3.5" />
        )}
        {retryingNow
          ? t.downloadStatus.waitingShort.replace('{s}', String(Math.ceil(localRetryMs / 1000)))
          : live.length > 0
            ? t.downloadStatus.runningCount.replace('{n}', String(live.length))
            : totalErrors > 0
              ? t.downloadStatus.errorCount.replace('{n}', String(totalErrors))
              : t.downloadStatus.idle}
        {(activeReq > 0 || queuedReq > 0) && (
          <span className="text-[10px] font-normal opacity-80">
            · {activeReq}/{queuedReq}
          </span>
        )}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={t.downloadStatus.title}
          className="absolute bottom-full right-0 mb-2 w-[min(92vw,24rem)] max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg-card p-3 shadow-card"
        >
          <header className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {t.downloadStatus.title}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap-target-tight rounded text-muted hover:text-white"
              aria-label={t.common.close}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </header>
          <p className="mb-3 text-[10px] text-muted">
            {t.downloadStatus.throttleStats.replace('{active}', String(activeReq)).replace('{queued}', String(queuedReq))}
          </p>
          {[...live, ...visibleFinished].length === 0 && (
            <p className="text-xs text-muted">{t.downloadStatus.empty}</p>
          )}
          <ul className="space-y-2">
            {[...live, ...visibleFinished].map((j) => {
              const pct = j.total === 0 ? 0 : Math.round((j.done / j.total) * 100);
              const finished = j.finished_at != null;
              const stateIcon = finished
                ? j.errors.length > 0
                  ? <AlertTriangle className="h-3 w-3 shrink-0 text-status-dropped" aria-label={t.downloadStatus.kindError} />
                  : <CheckCircle2 className="h-3 w-3 shrink-0 text-status-completed" aria-label={t.downloadStatus.kindDone} />
                : <CloudDownload className="h-3 w-3 shrink-0 animate-pulse text-accent" aria-label={t.downloadStatus.kindRunning} />;
              return (
                <li key={j.id} className="rounded-md border border-border bg-bg-elev/30 p-2">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate font-semibold">
                      {stateIcon}
                      {labelKind(j.kind)} · {j.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">
                      {j.done}/{j.total}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={j.done}
                    aria-valuemin={0}
                    aria-valuemax={j.total || 1}
                    aria-label={`${labelKind(j.kind)} · ${j.label}`}
                    className="mt-1 h-1.5 w-full overflow-hidden rounded bg-bg-elev"
                  >
                    <div
                      className={`h-full transition-[width] ${
                        finished
                          ? j.errors.length > 0
                            ? 'bg-status-dropped'
                            : 'bg-status-completed'
                          : 'bg-accent'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {j.errors.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-status-dropped">
                      {j.errors.slice(0, 3).map((e, i) => (
                        <li key={`${j.id}-err-${i}`} className="truncate">
                          <AlertTriangle className="mr-1 inline-block h-2.5 w-2.5" />
                          <span className="font-bold">{e.item}</span>: {e.message}
                        </li>
                      ))}
                      {j.errors.length > 3 && (
                        <li className="opacity-70">+{j.errors.length - 3}</li>
                      )}
                    </ul>
                  )}
                  {finished && (
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedFinished((prev) => {
                          const next = new Set(prev);
                          next.add(j.id);
                          return next;
                        })
                      }
                      className="mt-1 text-[10px] text-muted hover:text-white"
                    >
                      {t.downloadStatus.dismiss}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
