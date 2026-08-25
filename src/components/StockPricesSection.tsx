'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import {
  extrasFromStockSnapshot,
  fetchStockPriceExtras,
  type StockSnapshotForPrices,
} from '@/lib/stock-prices';
import { ErrorAlert } from './ErrorAlert';
import { ErogePricePanelSkeleton } from './ErogePricePanelSkeleton';

const ErogePricePanel = dynamic(() => import('./ErogePricePanel').then((m) => m.ErogePricePanel), {
  ssr: false,
  loading: () => <ErogePricePanelSkeleton />,
});

export function StockPricesSection({ vnId, initialSnapshot }: { vnId: string; initialSnapshot?: StockSnapshotForPrices }) {
  const [extras, setExtras] = useState<ErogePriceExtrasV1 | null>(() => extrasFromStockSnapshot(initialSnapshot));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialSnapshot);

  useEffect(() => {
    setExtras(extrasFromStockSnapshot(initialSnapshot));
    setError(null);
    if (initialSnapshot) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchStockPriceExtras(vnId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setExtras(data);
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
  }, [vnId, initialSnapshot]);

  if (loading) return <div className="p-4 sm:p-5"><ErogePricePanelSkeleton /></div>;
  if (error) return <div className="p-4"><ErrorAlert title={error} /></div>;
  if (!extras) return null;
  return (
    <div className="p-4 sm:p-5">
      <ErogePricePanel vnId={vnId} extras={extras} />
    </div>
  );
}
