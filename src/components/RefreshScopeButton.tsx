'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, RefreshCw } from 'lucide-react';
import { useT, useLocale } from '@/lib/i18n/client';
import { fmtDate } from '@/lib/locale-number';
import { timeAgo } from '@/lib/time-ago';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

/**
 * R5-058 / R5-106 / R5-215 — context-specific refresh button.
 *
 * Where `<RefreshPageButton/>` blindly POSTs to `/api/refresh/global`
 * (which busts every page-level cache + re-fetches all of them),
 * this variant POSTs to `/api/refresh/scope` with a registered
 * scope id. Only the cache rows for THIS page are busted; the page
 * re-renders via `router.refresh()` and re-fetches the busted rows
 * lazily.
 *
 * Each scope id maps to:
 *   - A list of `cache_key LIKE` patterns (see
 *     `src/lib/refresh-scopes.ts`).
 *   - Label / tooltip i18n strings under
 *     `refreshScope.<scope>.{title, cta}` so the tooltip explicitly
 *     reflects WHAT is refreshed instead of the generic
 *     "Re-download global data" text.
 */
export function RefreshScopeButton({
  scope,
  params,
  lastUpdatedAt,
  className = '',
}: {
  /** Scope id registered in `REFRESH_SCOPES`. */
  scope: string;
  /** Optional template params, e.g. `{ gid: 'g73' }` for
   *  `tag-detail`. Unbound `{param}` placeholders cause a 400. */
  params?: Record<string, string>;
  /** Most-recent `fetched_at` for the cache rows this scope refreshes.
   *  When omitted the freshness chip is hidden. */
  lastUpdatedAt?: number | null;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Lookup the scope-specific labels. Falls back to the generic
  // refreshPage strings if the scope's labels are missing, so a
  // mis-named scope doesn't render an empty button.
  const scopeLabels = (t.refreshScope as Record<string, { title?: string; cta?: string } | undefined>)?.[scope];
  const ctaText = scopeLabels?.cta ?? t.refreshPage.cta;
  const titleText = scopeLabels?.title ?? t.refreshPage.title;

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/refresh/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, params: params ?? {} }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      setRefreshedAt(Date.now());
      toast.success(t.refreshPage.done);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const effectiveLastUpdated: number | null =
    refreshedAt != null
      ? Math.max(refreshedAt, lastUpdatedAt ?? 0)
      : (lastUpdatedAt ?? null);

  const showChip = lastUpdatedAt !== undefined;
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {showChip && <FreshnessChip lastUpdatedAt={effectiveLastUpdated} now={now} />}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="btn"
        title={titleText}
        data-refresh-scope={scope}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {ctaText}
      </button>
    </div>
  );
}

function FreshnessChip({ lastUpdatedAt, now }: { lastUpdatedAt: number | null; now: number }) {
  const t = useT();
  const locale = useLocale();
  const stale =
    lastUpdatedAt == null || now - lastUpdatedAt > 7 * 86_400_000;
  const label = timeAgo(lastUpdatedAt, t, now);
  const absolute = lastUpdatedAt == null ? '' : fmtDate(new Date(lastUpdatedAt), locale);
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
