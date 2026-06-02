'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Cloud, CloudDownload, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  decodeDownloadStatusSnapshot,
  type DownloadStatusJob as Job,
  type DownloadStatusSnapshot as Snapshot,
} from '@/lib/download-status-snapshot';

function interpolate(template: string, params?: Record<string, string | number> | null): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function translatedJobLabel(t: ReturnType<typeof useT>, job: Job): string {
  const templates = t.downloadStatus.jobLabels as Record<string, string | undefined>;
  return interpolate((job.label_code ? templates[job.label_code] : null) ?? job.label, job.label_params);
}

function translatedCurrentItem(t: ReturnType<typeof useT>, job: Job): string {
  if (!job.current_item) return translatedJobLabel(t, job);
  if (!job.current_item_code) return job.current_item_name ? `${job.current_item_name} (${job.current_item})` : job.current_item;
  const templates = t.downloadStatus.currentItems as Record<string, string | undefined>;
  return interpolate(templates[job.current_item_code] ?? job.current_item, job.current_item_params);
}

function CurrentItemText({ t, job }: { t: ReturnType<typeof useT>; job: Job }) {
  if (!job.current_item) return null;
  if (job.current_item_code) return <span>{translatedCurrentItem(t, job)}</span>;
  return <EntityLink id={job.current_item} name={job.current_item_name} />;
}

/** Maps a VNDB entity id prefix to its local app route. */
function idToHref(id: string): string | null {
  if (id.startsWith('v')) return `/vn/${id}`;
  if (id.startsWith('p')) return `/producer/${id}`;
  if (id.startsWith('s')) return `/staff/${id}`;
  if (id.startsWith('c')) return `/character/${id}`;
  if (id.startsWith('g')) return `/tag/${id}`;
  if (id.startsWith('i')) return `/trait/${id}`;
  return null;
}

/**
 * Renders a VNDB entity id as a local link. Shows `name (id)` when a name
 * is available, otherwise just the raw id. Falls back to a plain span when
 * the id doesn't map to a known route (e.g. free-text labels).
 */
function EntityLink({ id, name }: { id: string; name?: string | null }) {
  const href = idToHref(id);
  const label = name ? name : id;
  const suffix = name && href ? <span className="ml-0.5 opacity-50">({id})</span> : null;
  if (!href) return <span>{label}</span>;
  return (
    <Link
      href={href}
      className="hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}{suffix}
    </Link>
  );
}

/**
 * Renders the job label, replacing the embedded VN id with a link when
 * `vn_id` and `vn_title` are present.
 */
function JobLabelText({
  label,
  vnId,
  vnTitle,
}: {
  label: string;
  vnId: string | null;
  vnTitle?: string | null;
}) {
  if (!vnId || !label.includes(vnId)) return <span>{label}</span>;
  const idx = label.indexOf(vnId);
  const before = label.slice(0, idx);
  const after = label.slice(idx + vnId.length);
  return (
    <span>
      {before}
      <EntityLink id={vnId} name={vnTitle} />
      {after}
    </span>
  );
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const firstFocusable = popoverRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const [dismissedFinished, setDismissedFinished] = useState<Set<string>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Server-Sent Events stream gives us push-style updates within
    // milliseconds of any job mutation, with no polling cost when
    // nothing is happening. If `EventSource` isn't available or the
    // connection errors repeatedly, we drop back to interval polling
    // so older browsers and odd proxy setups still get progress.
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAbort: AbortController | null = null;
    let es: EventSource | null = null;
    let useSse = typeof window !== 'undefined' && 'EventSource' in window;

    async function pollOnce() {
      if (!alive) return;
      const controller = new AbortController();
      pollAbort?.abort();
      pollAbort = controller;
      let next: Snapshot | null = null;
      try {
        const r = await fetch('/api/download-status', { cache: 'no-store', signal: controller.signal });
        if (r.ok) {
          next = decodeDownloadStatusSnapshot(await r.json());
          if (alive && pollAbort === controller && !controller.signal.aborted && next) setData(next);
        }
      } catch {
        // Network blips are fine, retry on the next tick.
      }
      if (!alive || pollAbort !== controller || controller.signal.aborted) return;
      const active =
        (next?.jobs.some((j) => j.finished_at == null) ?? false) ||
        (next?.throttle.active ?? 0) > 0 ||
        (next?.throttle.queued ?? 0) > 0;
      // Slower cadence than the SSE event rate because polling is a
      // pure fallback for clients that lost the stream - we still
      // want updates, just not at high frequency.
      const delay = active ? 4_000 : 60_000;
      pollTimer = setTimeout(pollOnce, delay);
    }

    function startPolling() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      void pollOnce();
    }

    function startSse() {
      try {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        pollAbort?.abort();
        pollAbort = null;
        es = new EventSource('/api/download-status/stream');
        es.onmessage = (e) => {
          if (!alive) return;
          try {
            const next = decodeDownloadStatusSnapshot(JSON.parse(e.data));
            if (next) setData(next);
          } catch {
            // Bad frame - ignore, the next one will be valid.
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
      pollAbort?.abort();
      if (es) es.close();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);

  const live = data?.jobs.filter((j) => j.finished_at == null) ?? [];
  const visibleFinished = (data?.jobs.filter((j) => j.finished_at != null && !dismissedFinished.has(j.id)) ?? []).slice(0, 6);
  const visibleJobs = [...live, ...visibleFinished];
  const totalErrors = visibleJobs.reduce((acc, j) => acc + j.errors.length, 0);
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
  const currentItemText = (j: Job): string => {
    return translatedCurrentItem(t, j);
  };

  return (
    // Anchored bottom-right above the QuoteFooter (which lives at bottom-0
    // and grows to ~112px on hover - `bottom-32` clears the expanded
    // height). Popover opens upward so it stays inside the viewport.
    <div
      className="fixed bottom-5 right-2 z-40 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2 sm:right-4 sm:max-w-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {retryingNow && (
        <div className="rounded-md border border-status-on_hold/60 bg-status-on_hold/10 px-3 py-2 text-[11px] text-status-on_hold shadow-card">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {t.downloadStatus.retrying}
          </div>
          <div className="text-[10px] opacity-90">
            {t.downloadStatus.retryCountdown.replace('{s}', String(Math.ceil(localRetryMs / 1000)))}
          </div>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`tap-target group flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-card transition-colors ${
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
        title={
          live.length === 1 && live[0].current_item
            ? `${labelKind(live[0].kind)} / ${currentItemText(live[0])}`
            : t.downloadStatus.title
        }
      >
        {retryingNow ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : live.length > 0 ? (
          <CloudDownload className="h-4 w-4 shrink-0 animate-pulse" aria-hidden />
        ) : totalErrors > 0 ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Cloud className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {/*
          Collapsed state surfaces the source-specific task on the
          chip itself so the user does NOT need to open the popover
          to know what's downloading. Falls back to the generic
          "{n} en cours" count when there are multiple in-flight
          jobs (the popover then disambiguates). The previous chip
          only showed "1 en cours / 0/0" which manual QA flagged
          as opaque ("can't see what's downloading").
        */}
        <span
          className="min-w-0 truncate"
          title={
            retryingNow
              ? t.downloadStatus.waitingShort.replace('{s}', String(Math.ceil(localRetryMs / 1000)))
              : live.length === 1
                ? (() => { const j = live[0]; return `${labelKind(j.kind)} / ${currentItemText(j)}`; })()
                : live.length > 1
                  ? t.downloadStatus.runningCount.replace('{n}', String(live.length))
                  : totalErrors > 0
                    ? t.downloadStatus.errorCount.replace('{n}', String(totalErrors))
                    : t.downloadStatus.idle
          }
        >
          {retryingNow
            ? t.downloadStatus.waitingShort.replace('{s}', String(Math.ceil(localRetryMs / 1000)))
            : live.length === 1
              ? (() => {
	                  const j = live[0];
	                  const head = labelKind(j.kind);
	                  const tail = currentItemText(j);
		                  return `${head} / ${tail}`;
	                })()
              : live.length > 1
                ? t.downloadStatus.runningCount.replace('{n}', String(live.length))
                : totalErrors > 0
                  ? t.downloadStatus.errorCount.replace('{n}', String(totalErrors))
                  : t.downloadStatus.idle}
        </span>
        {live.length === 1 && live[0].total > 0 && (
          <span className="shrink-0 text-[10px] font-normal opacity-80">
            {live[0].done}/{live[0].total}
          </span>
        )}
        {(activeReq > 0 || queuedReq > 0) && (
          <span className="shrink-0 text-[10px] font-normal opacity-80">
	            / {activeReq}/{queuedReq}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="region"
          aria-label={t.downloadStatus.title}
          tabIndex={-1}
          className="absolute bottom-full right-0 mb-2 w-[min(92vw,24rem)] max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg-card p-3 shadow-card outline-none"
        >
          <header className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {t.downloadStatus.title}
            </span>
	            <button
	              type="button"
	              onClick={() => setOpen(false)}
	              className="tap-target rounded text-muted hover:text-white"
	              aria-label={t.common.close}
	            >
	              <X className="h-3 w-3" aria-hidden />
	            </button>
	          </header>
	          {visibleFinished.length > 0 && (
	            <button
	              type="button"
	              onClick={() =>
	                setDismissedFinished((prev) => {
	                  const next = new Set(prev);
	                  for (const j of visibleFinished) next.add(j.id);
	                  return next;
	                })
	              }
	              className="mb-2 text-[10px] font-semibold text-muted underline-offset-2 hover:text-white hover:underline"
	            >
	              {t.downloadStatus.dismissAll}
	            </button>
	          )}
	          <p className="mb-3 text-[10px] text-muted">
	            {t.downloadStatus.throttleStats.replace('{active}', String(activeReq)).replace('{queued}', String(queuedReq))}
	          </p>
	          {visibleJobs.length === 0 && (
	            <p className="text-xs text-muted">{t.downloadStatus.empty}</p>
	          )}
	          <ul className="space-y-2">
	            {visibleJobs.map((j) => {
              const pct = j.total === 0 ? 0 : Math.round((j.done / j.total) * 100);
              const finished = j.finished_at != null;
              const failed = j.errors.length > 0 || j.cancelled === true;
              const stateIcon = finished
                ? failed
                  ? <AlertTriangle className="h-3 w-3 shrink-0 text-status-dropped" aria-label={j.cancelled ? t.downloadStatus.kindCancelled : t.downloadStatus.kindError} aria-hidden />
                  : <CheckCircle2 className="h-3 w-3 shrink-0 text-status-completed" aria-label={t.downloadStatus.kindDone} aria-hidden />
                : <CloudDownload className="h-3 w-3 shrink-0 animate-pulse text-accent" aria-label={t.downloadStatus.kindRunning} aria-hidden />;
              return (
                <li key={j.id} className="rounded-md border border-border bg-bg-elev/30 p-2">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate font-semibold">
                      {stateIcon}
                      {/*
                        While the job is running, the CURRENT TASK is
                        the most informative thing on the bar (e.g.
                        "EGS top-ranked (top 100)" instead of generic
                        "Caches / Global refresh"). Promote it to the
                        main line; fall back to the job label when no
                        current_item is set (queue tail / finished).
                      */}
                      {!finished && j.current_item ? (
                        <>{labelKind(j.kind)} - <CurrentItemText t={t} job={j} /></>
                      ) : (
                        <span>
                          {labelKind(j.kind)} /{' '}
                          <JobLabelText label={translatedJobLabel(t, j)} vnId={j.vn_id ?? null} vnTitle={j.vn_title} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">
                      {j.done}/{j.total}
                    </span>
                    {j.cancelled && (
                      <span className="shrink-0 text-[10px] font-semibold text-status-dropped">
                        {t.downloadStatus.kindCancelled}
                      </span>
                    )}
                  </div>
                  {!finished && j.current_item && (
                    <div className="mt-0.5 truncate text-[10px] text-muted/90" title={`${labelKind(j.kind)} / ${translatedJobLabel(t, j)}`}>
                      {labelKind(j.kind)} /{' '}
                      <JobLabelText label={translatedJobLabel(t, j)} vnId={j.vn_id ?? null} vnTitle={j.vn_title} />
                    </div>
                  )}
                  <div
                    role="progressbar"
                    aria-valuenow={j.done}
                    aria-valuemin={0}
                    aria-valuemax={j.total || 1}
                    aria-label={`${labelKind(j.kind)} / ${translatedJobLabel(t, j)}`}
                    className="mt-1 h-1.5 w-full overflow-hidden rounded bg-bg-elev"
                  >
                    <div
                      className={`h-full transition-[width] ${
                        finished
                          ? failed
                            ? 'bg-status-dropped'
                            : 'bg-status-completed'
                          : 'bg-accent'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {j.errors.length > 0 && (() => {
                    const errorsExpanded = expandedErrors.has(j.id);
                    const shownErrors = errorsExpanded ? j.errors : j.errors.slice(0, 3);
                    const hiddenErrors = j.errors.length - shownErrors.length;
                    return (
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-status-dropped">
                        {shownErrors.map((e, i) => (
                          <li key={`${j.id}-err-${i}`} className="truncate" title={`${e.item}: ${e.message}`}>
                            <AlertTriangle className="mr-1 inline-block h-2.5 w-2.5" aria-hidden />
                            <span className="font-bold">
                              {idToHref(e.item) ? (
                                <EntityLink id={e.item} />
                              ) : (
                                e.item
                              )}
                            </span>: {e.message}
                          </li>
                        ))}
                        {j.errors.length > 3 && (
                          <li>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedErrors((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(j.id)) next.delete(j.id);
                                  else next.add(j.id);
                                  return next;
                                })
                              }
                              aria-expanded={errorsExpanded}
                              className="tap-target rounded text-[10px] font-semibold text-status-dropped underline-offset-2 hover:underline"
                            >
                              {errorsExpanded ? t.common.close : `+${hiddenErrors}`}
                            </button>
                          </li>
                        )}
                      </ul>
                    );
                  })()}
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
