'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { asJsonRecord } from '@/lib/json-shape';
import { useT } from '@/lib/i18n/client';
import type { RecommendMode } from '@/lib/recommend-types';

type LoadState = 'idle' | 'loading' | 'partial' | 'error' | 'complete';

interface Props {
  enabled: boolean;
  mode: RecommendMode;
  includeEro: boolean;
  includeOwned: boolean;
  includeWishlist: boolean;
  customTagIds: string[];
  seedVnId?: string;
}

/**
 * Populate missing recommendation snapshots after the cached page has painted.
 *
 * @param props Active recommendation filters and cache-completeness state.
 * @returns A compact progress or retry surface while VNDB hydration runs.
 */
export function RecommendationRemoteLoader({
  enabled,
  mode,
  includeEro,
  includeOwned,
  includeWishlist,
  customTagIds,
  seedVnId,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>(enabled ? 'idle' : 'complete');
  const [, startTransition] = useTransition();
  const requestBody = JSON.stringify({
    mode,
    includeEro,
    includeOwned,
    includeWishlist,
    customTagIds,
    ...(seedVnId ? { seedVnId } : {}),
  });

  useEffect(() => {
    if (!enabled) {
      setState('complete');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    void fetch('/api/recommendations/hydrate', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal,
    }).then(async (response) => {
      const payload = asJsonRecord(await response.json().catch(() => null));
      if (!response.ok || payload?.ok !== true) throw new Error(t.recommend.refreshFailed);
      if (controller.signal.aborted) return;
      setState(payload.complete === true ? 'complete' : 'partial');
      startTransition(() => router.refresh());
    }).catch(() => {
      if (controller.signal.aborted) return;
      setState('error');
    });
    return () => controller.abort();
  }, [attempt, enabled, requestBody, router, t.recommend.refreshFailed]);

  if (!enabled || state === 'complete') return null;
  if (state === 'idle' || state === 'loading') {
    return (
      <div className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t.recommend.refreshing}
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs text-status-on_hold" role="alert">
      <span>{state === 'partial' ? t.recommend.refreshPartial : t.recommend.refreshFailed}</span>
      <button
        type="button"
        className="btn btn-xs min-h-[44px] sm:min-h-0"
        onClick={() => setAttempt((value) => value + 1)}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {t.common.retry}
      </button>
    </div>
  );
}
