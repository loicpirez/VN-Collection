'use client';

import { useEffect, useState } from 'react';
import { CardDensitySlider } from './CardDensitySlider';
import { ErrorAlert } from './ErrorAlert';
import { PaginatedGrid } from './PaginatedGrid';
import { SearchVndbResultsSkeleton } from './SearchPageSkeleton';
import { VnCard } from './VnCard';
import { toCardData } from './cardData';
import { fetchAllCollectionItems } from '@/lib/collection-api-client';
import { decodeCollectionCardItem } from '@/lib/collection-client-shape';
import { useT } from '@/lib/i18n/client';
import type { CollectionCardApiItem } from '@/lib/types';
import { VN_COLLECTION_CHANGED_EVENT } from '@/lib/vn-collection-events';

export function SoldSearchResults({ query }: { query: string }) {
  const t = useT();
  const failureText = t.search.errorPrefix;
  const q = query.trim();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: CollectionCardApiItem[]; error: string | null }>();
  const key = JSON.stringify([q, revision]);

  useEffect(() => {
    function refresh() {
      setRevision((previous) => previous + 1);
    }
    window.addEventListener(VN_COLLECTION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(VN_COLLECTION_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ status: 'sold' });
      if (q) params.set('q', q);
      try {
        const rows = await fetchAllCollectionItems(params, decodeCollectionCardItem, { signal: controller.signal }, failureText);
        if (!controller.signal.aborted) setResult({ key, rows, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ key, rows: [], error: error instanceof Error ? error.message : failureText });
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [failureText, key, q]);

  if (result?.key !== key) return <SearchVndbResultsSkeleton label={t.common.loading} />;
  if (result.error) return <ErrorAlert title={result.error} />;
  if (result.rows.length === 0) return <p className="py-20 text-center text-muted">{t.search.noResults}</p>;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <CardDensitySlider scope="search" />
      </div>
      <PaginatedGrid
        ariaLabel={t.status.sold}
        resetKey={q}
        className="grid items-stretch gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {result.rows.map((row) => (
          <li key={row.id} className="flex min-h-0 min-w-0 flex-col items-stretch self-stretch" data-vn-card-cell>
            <VnCard data={toCardData(row)} />
          </li>
        ))}
      </PaginatedGrid>
    </>
  );
}
