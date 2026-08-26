'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock3, History, RefreshCw } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtDate } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';
import { decodeStockBatchQueuePage, type StockBatchQueueEntry } from '@/lib/stock-batch-client-shape';
import {
  decodeDownloadStatusSnapshot,
  type DownloadStatusJob,
} from '@/lib/download-status-snapshot';
import { StockRecentActivitySkeleton } from './StockRecentActivitySkeleton';

type FinishedStockJob = DownloadStatusJob & { finished_at: number };

interface RecentActivity {
  entries: StockBatchQueueEntry[];
  jobs: FinishedStockJob[];
}

function interpolate(template: string, params?: Record<string, string | number> | null): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function translatedJobLabel(t: ReturnType<typeof useT>, job: FinishedStockJob): string {
  const templates = t.downloadStatus.jobLabels as Record<string, string | undefined>;
  return interpolate((job.label_code ? templates[job.label_code] : null) ?? job.label, job.label_params);
}

/**
 * Recent per-VN checks and completed stock batches for the empty stock workspace.
 *
 * @returns A localized, retryable recent-activity section.
 */
export function StockRecentActivity() {
  const t = useT();
  const locale = useLocale();
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setActivity(null);
    setError(null);
    Promise.all([
      fetch('/api/stock/queue?scope=recent_checked&page=1&page_size=6', {
        cache: 'no-store',
        signal: controller.signal,
      }),
      fetch('/api/download-status', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([queueResponse, statusResponse]) => {
        if (!queueResponse.ok) throw new Error(await readApiError(queueResponse, t.common.error));
        if (!statusResponse.ok) throw new Error(await readApiError(statusResponse, t.common.error));
        const queue = decodeStockBatchQueuePage(await queueResponse.json());
        const snapshot = decodeDownloadStatusSnapshot(await statusResponse.json());
        if (!queue || !snapshot) throw new Error(t.common.error);
        const jobs = snapshot.jobs
          .filter((job): job is FinishedStockJob => job.kind === 'stock-batch' && job.finished_at !== null)
          .sort((a, b) => b.finished_at - a.finished_at)
          .slice(0, 3);
        return { entries: queue.entries, jobs };
      })
      .then((next) => {
        if (!controller.signal.aborted) setActivity(next);
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === 'AbortError')) return;
        setError(caught instanceof Error && caught.message ? caught.message : t.common.error);
      });
    return () => controller.abort();
  }, [retryKey, t.common.error]);

  return (
    <section className="mt-4 rounded-xl border border-border bg-bg-card p-4 sm:p-5" aria-labelledby="recent-stock-activity-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recent-stock-activity-title" className="inline-flex items-center gap-2 text-sm font-bold text-white">
            <History className="h-4 w-4 text-accent" aria-hidden />
            {t.stock.recentActivityTitle as string}
          </h2>
          <p className="mt-1 text-xs text-muted">{t.stock.recentActivityHint as string}</p>
        </div>
        <a href="#stock-batch" className="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-semibold text-accent hover:underline can-hover:sm:min-h-[36px]">
          {t.stock.openBatchTools as string}
        </a>
      </header>

      {!activity && !error && (
        <StockRecentActivitySkeleton label={t.common.loading} />
      )}

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-3 text-xs text-status-dropped">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {t.stock.recentActivityUnavailable as string}: {error}
          </span>
          <button
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 font-semibold hover:bg-status-dropped/10 can-hover:sm:min-h-[36px]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.common.retry}
          </button>
        </div>
      )}

      {activity && activity.entries.length === 0 && activity.jobs.length === 0 && (
        <p className="mt-4 text-xs text-muted">{t.stock.recentActivityEmpty as string}</p>
      )}

      {activity && activity.entries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">{t.stock.recentChecked as string}</h3>
          <ul className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {activity.entries.map((entry) => (
              <li key={entry.vnId} className="min-w-0">
                <Link
                  href={`/stock?vn=${encodeURIComponent(entry.vnId)}`}
                  prefetch={false}
                  className="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2 text-xs hover:border-accent hover:text-accent"
                >
                  <span className="min-w-0 truncate font-semibold">{entry.title ?? entry.vnId}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{entry.vnId}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activity && activity.jobs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">{t.stock.recentBatches as string}</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-bg px-3">
            {activity.jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs">
                <span className="min-w-0 font-semibold text-white">{translatedJobLabel(t, job)}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted">
                  <Clock3 className="h-3 w-3" aria-hidden />
                  {fmtDate(new Date(job.finished_at), locale, { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span className="w-full text-[10px] text-muted">
                  {(t.stock.recentBatchSummary as string)
                    .replace('{done}', String(job.done))
                    .replace('{total}', String(job.total))
                    .replace('{errors}', String(job.errors.length))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
