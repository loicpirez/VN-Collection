'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { timeAgo } from '@/lib/time-ago';
import { useToast } from './ToastProvider';

/**
 * Re-fetch every page-level cache the browse / discovery pages depend
 * on (EGS anticipated, VNDB stats, upcoming releases, etc.) and then
 * router.refresh() the current page so the server components re-render
 * with the new data. Standalone button — drops in on /producers,
 * /tags, /traits, /upcoming, /stats, /data, /year, /quotes,
 * /brand-overlap, /recommendations, /shelf, /similar.
 *
 * `lastUpdatedAt` (epoch-ms) is the most recent `fetched_at` from the
 * cache rows powering the current page. Computed server-side by the
 * caller via `getCacheFreshness()` and rendered as a relative-time
 * chip next to the button so the user always sees how stale the data
 * is at a glance.
 */
export function RefreshPageButton({
  className = '',
  lastUpdatedAt,
}: {
  className?: string;
  /**
   * Most-recent `fetched_at` (epoch-ms) for the cache rows powering this
   * page. When omitted (or undefined) the freshness chip is hidden
   * entirely — pages with on-demand or local-only data shouldn't pretend
   * to have a meaningful freshness reading. Pass `null` to explicitly
   * render a "never downloaded" chip.
   */
  lastUpdatedAt?: number | null;
} = {}) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // `now` starts at lastUpdatedAt itself so the SSR render of the chip
  // reads "just now" instead of a raw `toLocaleString()` timestamp. Once
  // the client mounts we tick every 30s for live updates.
  const [now, setNow] = useState<number>(
    typeof lastUpdatedAt === 'number' ? lastUpdatedAt : Date.now(),
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/refresh/global', { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const body = (await r.json()) as { done: number; failed: number; total: number };
      if (body.failed > 0) {
        toast.error(t.refreshPage.partial
          .replace('{done}', String(body.done))
          .replace('{total}', String(body.total)));
      } else {
        toast.success(t.refreshPage.done);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Undefined → page is local-only or on-demand, no freshness chip.
  // null → page tracks a remote cache that's never been populated.
  // number → real timestamp, render relative time.
  const showChip = lastUpdatedAt !== undefined;
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {showChip && <FreshnessChip lastUpdatedAt={lastUpdatedAt} now={now} />}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="btn"
        title={t.refreshPage.title}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {t.refreshPage.cta}
      </button>
    </div>
  );
}

function FreshnessChip({ lastUpdatedAt, now }: { lastUpdatedAt: number | null; now: number }) {
  const t = useT();
  const stale =
    lastUpdatedAt == null || now - lastUpdatedAt > 7 * 86_400_000;
  const label = timeAgo(lastUpdatedAt, t, now);
  const absolute = lastUpdatedAt == null ? '' : new Date(lastUpdatedAt).toLocaleString();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
        stale
          ? 'border-status-dropped/40 bg-status-dropped/10 text-status-dropped'
          : 'border-border bg-bg-elev/40 text-muted'
      }`}
      title={absolute || undefined}
      suppressHydrationWarning
    >
      <Clock className="h-3 w-3 opacity-70" />
      <span className="opacity-70">{t.refreshPage.lastUpdatedLabel}</span>
      <span>{label}</span>
    </span>
  );
}
