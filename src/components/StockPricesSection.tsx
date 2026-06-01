'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import { ErrorAlert } from './ErrorAlert';
import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

const ErogePricePanel = dynamic(() => import('./ErogePricePanel').then((m) => m.ErogePricePanel), { ssr: false });

interface StockSnapshot {
  statuses?: Array<{ provider: string; extras_json?: string | null }>;
}

/**
 * Placeholder shaped like the resolved `<ErogePricePanel>` (bordered card
 * with header, identity row, stats trio, and chart block) so the layout
 * doesn't shift when the price data arrives.
 */
function StockPricesSkeleton() {
  return (
    <SkeletonBoundary className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-6 w-28 rounded-md" />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <SkeletonBlock className="aspect-[2/3] h-32 w-24 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <SkeletonBlock className="mt-4 h-40 w-full rounded-lg" />
    </SkeletonBoundary>
  );
}

export function StockPricesSection({ vnId }: { vnId: string }) {
  const [extras, setExtras] = useState<ErogePriceExtrasV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setExtras(null);
    setError(null);
    setLoading(true);
    fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: StockSnapshot | null) => {
        if (controller.signal.aborted) return;
        if (!data) return;
        const row = (data.statuses ?? []).find((s) => s.provider === 'eroge_price');
        if (!row?.extras_json) return;
        try {
          const parsed = JSON.parse(row.extras_json) as ErogePriceExtrasV1;
          if (parsed.schemaVersion === 1) setExtras(parsed);
        } catch {}
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [vnId]);

  if (loading) return <StockPricesSkeleton />;
  if (error) return <div className="p-4"><ErrorAlert title={error} /></div>;
  if (!extras) return null;
  return (
    <div className="p-4 sm:p-5">
      <ErogePricePanel vnId={vnId} extras={extras} />
    </div>
  );
}
