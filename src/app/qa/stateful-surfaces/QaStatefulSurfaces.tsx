'use client';

import { useState } from 'react';
import { PhysicalBundleDialog } from '@/components/PhysicalBundleDialog';
import { PlaceDetailClient } from '@/components/PlaceDetailClient';
import { VndbLocalImportPanel } from '@/components/VndbLocalImportPanel';
import type { PlaceWithLinks } from '@/lib/db';

const MIXED_STOCK_PLACE: PlaceWithLinks = {
  id: 90001,
  name: 'QA mixed stock shop',
  name_ja: null,
  kind: 'shop',
  address: null,
  lat: null,
  lng: null,
  url: null,
  notes: null,
  created_at: 1,
  updated_at: 1,
  provider_labels: ['AliceNet', 'QA Branch'],
  stock_count: 0,
  stock_updated_at: null,
};

/** Mount production stateful components with deterministic QA-only fixtures. */
export function QaStatefulSurfaces() {
  const [bundleOpen, setBundleOpen] = useState(false);
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <section aria-labelledby="qa-bundle-heading">
        <h1 id="qa-bundle-heading" className="text-xl font-bold">Stateful geometry QA</h1>
        <button type="button" className="btn mt-3 min-h-11" onClick={() => setBundleOpen(true)}>
          Open physical bundle QA
        </button>
        <PhysicalBundleDialog
          open={bundleOpen}
          onClose={() => setBundleOpen(false)}
          candidates={[]}
          onChanged={() => undefined}
        />
      </section>

      <section aria-labelledby="qa-mixed-stock-heading">
        <h2 id="qa-mixed-stock-heading" className="sr-only">Mixed stock QA</h2>
        <PlaceDetailClient place={MIXED_STOCK_PLACE} />
      </section>

      <section aria-label="VNDB import QA" className="rounded-xl border border-border bg-bg-card p-3">
        <VndbLocalImportPanel />
      </section>
    </div>
  );
}
