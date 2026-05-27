'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { StockBatchClient } from './StockBatchClient';
import { StockPanel } from './StockPanel';
import { StockPanelBoundary } from './StockPanelBoundary';
import { VnSourcePicker, type VnPickerHit } from './VnSourcePicker';

export function StockLookupClient({ initialVnId }: { initialVnId: string | null }) {
  const t = useT();
  const router = useRouter();
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!initialVnId) { setResolvedTitle(null); return; }
    setResolvedTitle(null);
    const ctrl = new AbortController();
    fetch(`/api/vn/${encodeURIComponent(initialVnId)}`, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { vn?: { title?: string } } | null) => {
        if (data?.vn?.title) setResolvedTitle(data.vn.title);
      })
      .catch((e: unknown) => {
        // P-119: previously silently swallowed every error. Log so
        // failures surface in the dev console instead of leaving the
        // header VN-name empty with no clue why.
        if ((e as Error).name === 'AbortError') return;
        console.error('[StockLookupClient] resolve title failed:', e);
      });
    return () => ctrl.abort();
  }, [initialVnId]);

  function handlePick(hit: VnPickerHit) {
    router.push(`/stock?vn=${encodeURIComponent(hit.id)}`);
  }

  return (
    <div className="page-space mx-auto max-w-screen-2xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-xl font-bold">
            <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
            {t.stock.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-muted">{t.stock.pageSubtitle}</p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" aria-labelledby="stock-picker-label">
        <h2 id="stock-picker-label" className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted">
          {t.stock.searchLabel}
        </h2>
        <p className="mb-3 text-[11px] text-muted">{t.stock.pickerHint as string}</p>
        <VnSourcePicker onPick={handlePick} placeholder={t.stock.searchPlaceholder} />
      </section>

      {initialVnId ? (
        <div className="mt-5">
          <StockPanelBoundary
            title={t.stock.title}
            fallbackMessage={t.stock.boundaryFallback as string}
            retryLabel={t.stock.boundaryRetry as string}
          >
            <StockPanel vnId={initialVnId} title={resolvedTitle ?? undefined} />
          </StockPanelBoundary>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-bg-card p-6 text-sm text-muted">
          {t.stock.pickVn}
        </div>
      )}

      <StockBatchClient />
    </div>
  );
}
