'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { decodeProducerRefreshSummary } from '@/lib/picker-client-shape';
import { SkeletonBlock } from './Skeleton';

/**
 * Hydrates missing studio credit pages after the local page has painted.
 * @param props Producer identity and whether a complete cache is missing.
 * @returns Loading feedback or an explicit retryable error, never a false empty list.
 */
export function WorksCacheLoader({ producerId, needed }: { producerId: string; needed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!needed) return;
    const controller = new AbortController();
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch(`/api/producer/${producerId}/refresh`, { method: 'POST', signal: controller.signal });
        if (!response.ok) throw new Error(t.common.error);
        const summary = decodeProducerRefreshSummary(await response.json());
        if (!summary || summary.stale) throw new Error(t.common.error);
        if (!controller.signal.aborted) router.refresh();
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [producerId, needed, attempt, router, t.common.error]);
  if (!needed) return null;
  if (failed) return <div role="alert" className="rounded-lg border border-border p-4 text-sm text-muted">{t.apiErrors.vndbUnavailable} <button className="btn min-h-[44px]" onClick={() => setAttempt((value) => value + 1)}>{t.common.retry}</button></div>;
  return <div role="status" aria-label={t.common.loading} aria-busy="true"><SkeletonBlock className="h-24 w-full rounded-lg" /></div>;
}

/**
 * Reconciles header metadata and counters after a previously missing staff cache streams in.
 * @returns No visible content; the existing page remains usable during reconciliation.
 */
export function RefreshCachedCredits() {
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);
  return null;
}
