'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { asJsonRecord } from '@/lib/json-shape';
import { useT } from '@/lib/i18n/client';
import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

type LoadState = 'idle' | 'loading' | 'partial' | 'error' | 'complete';

/**
 * Hydrate one tag page after its cache-only server shell has completed.
 *
 * @param props Tag identity, page, mode, and whether any local snapshot is
 * missing or stale.
 * @returns A compact loading or retry status; nothing once hydration completes.
 */
export function TagRemoteLoader({
  enabled,
  tagId,
  page,
  mode,
}: {
  /** Whether the server detected a missing or expired snapshot. */
  enabled: boolean;
  /** Canonical VNDB tag identifier. */
  tagId: string;
  /** Ranked-results page to hydrate. */
  page: number;
  /** Active page mode; local mode only hydrates tag metadata. */
  mode: 'local' | 'vndb';
}) {
  const t = useT();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>(enabled ? 'idle' : 'complete');
  const [message, setMessage] = useState(t.tagPage.refreshFailed);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      setState('complete');
      setMessage(t.tagPage.refreshFailed);
      return;
    }
    const controller = new AbortController();
    setState('loading');
    setMessage(t.tagPage.refreshFailed);
    const params = new URLSearchParams({ page: String(page), mode });

    void fetch(`/api/tags/${encodeURIComponent(tagId)}/hydrate?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(t.tagPage.refreshFailed);
      const payload = asJsonRecord(await response.json().catch(() => null));
      if (controller.signal.aborted) return;
      const complete = payload?.complete === true;
      setState(complete ? 'complete' : 'partial');
      setMessage(t.tagPage.refreshPartial);
      startTransition(() => router.refresh());
    }).catch((error: Error) => {
      if (controller.signal.aborted) return;
      setState('error');
      setMessage(error.message || t.tagPage.refreshFailed);
    });

    return () => controller.abort();
  }, [attempt, enabled, mode, page, router, t.tagPage.refreshFailed, t.tagPage.refreshPartial, tagId]);

  if (!enabled || state === 'complete') return null;
  if (state === 'loading' || state === 'idle') {
    return (
      <SkeletonBoundary label={t.common.loading} className="mt-3">
        <SkeletonBlock className="h-3.5 w-40" />
      </SkeletonBoundary>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-status-dropped" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="btn btn-xs"
        onClick={() => setAttempt((value) => value + 1)}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {t.common.retry}
      </button>
    </div>
  );
}
