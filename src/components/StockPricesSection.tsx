'use client';
import { useEffect, useState } from 'react';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import { ErogePricePanel } from './ErogePricePanel';

interface StockSnapshot {
  statuses?: Array<{ provider: string; extras_json?: string | null }>;
}

export function StockPricesSection({ vnId }: { vnId: string }) {
  const [extras, setExtras] = useState<ErogePriceExtrasV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: StockSnapshot | null) => {
        if (!data) return;
        const row = (data.statuses ?? []).find((s) => s.provider === 'eroge_price');
        if (!row?.extras_json) return;
        try {
          const parsed = JSON.parse(row.extras_json) as ErogePriceExtrasV1;
          if (parsed.schemaVersion === 1) setExtras(parsed);
        } catch {}
      })
      .catch((e: unknown) => {
        setError((e as Error).message);
      });
  }, [vnId]);

  if (error) return <p className="mt-2 text-sm text-status-dropped">{error}</p>;
  if (!extras) return null;
  return <ErogePricePanel vnId={vnId} extras={extras} />;
}
