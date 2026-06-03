'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ShoppingBag } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { runAliceNetWholeRefresh, type AliceNetRefreshProgress } from '@/lib/alicenet-pipeline';
import { StockBatchClient } from './StockBatchClient';
import { StockPanel } from './StockPanel';
import { StockPanelBoundary } from './StockPanelBoundary';
import { VnSourcePicker, type VnPickerHit } from './VnSourcePicker';
import { decodePlaceProviderMapResponse } from '@/lib/place-client-shape';
import { readApiError } from '@/lib/api-error-read';
import { decodeVnTitleResponse } from '@/lib/vn-summary-client-shape';

export function StockLookupClient({ initialVnId }: { initialVnId: string | null }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  const [placeMap, setPlaceMap] = useState<Record<string, number>>({});
  const [alicenetRefreshing, setAlicenetRefreshing] = useState(false);
  const [alicenetProgress, setAlicenetProgress] = useState<AliceNetRefreshProgress | null>(null);
  const alicenetAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/places/provider-map', { cache: 'no-store', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        return decodePlaceProviderMapResponse(await r.json());
      })
      .then((map) => {
        if (!ctrl.signal.aborted && map) setPlaceMap(map);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [t.common.error]);

  useEffect(() => {
    if (!initialVnId) { setResolvedTitle(null); return; }
    setResolvedTitle(null);
    const ctrl = new AbortController();
    fetch(`/api/vn/${encodeURIComponent(initialVnId)}`, { cache: 'no-store', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        return decodeVnTitleResponse(await r.json());
      })
      .then((title) => {
        if (!ctrl.signal.aborted && title) setResolvedTitle(title);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[StockLookupClient] resolve title failed:', e);
      });
    return () => ctrl.abort();
  }, [initialVnId, t.common.error]);

  useEffect(() => () => alicenetAbortRef.current?.abort(), []);

  async function refreshAlicenet() {
    if (alicenetRefreshing) return;
    const ctrl = new AbortController();
    alicenetAbortRef.current = ctrl;
    setAlicenetRefreshing(true);
    setAlicenetProgress(null);
    try {
      const result = await runAliceNetWholeRefresh({
        errorFallback: t.common.error,
        signal: ctrl.signal,
        onProgress: (p) => setAlicenetProgress(p),
      });
      if (ctrl.signal.aborted) return;
      toast.success((t.stock.alicenetRefreshDone as string).replace('{matched}', String(result.matched)));
      router.refresh();
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
      toast.error(`${t.stock.alicenetRefresh as string}: ${(e as Error).message}`);
    } finally {
      if (alicenetAbortRef.current === ctrl) alicenetAbortRef.current = null;
      setAlicenetRefreshing(false);
      setAlicenetProgress(null);
    }
  }

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
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={refreshAlicenet}
            disabled={alicenetRefreshing}
            aria-busy={alicenetRefreshing}
            title={t.stock.alicenetRefreshHint as string}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {alicenetRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {alicenetRefreshing ? (t.stock.alicenetRefreshing as string) : (t.stock.alicenetRefresh as string)}
          </button>
          {alicenetRefreshing && alicenetProgress && alicenetProgress.total > 0 && (
            <span className="text-[11px] tabular-nums text-muted" aria-live="polite">
              {alicenetProgress.done}/{alicenetProgress.total}
            </span>
          )}
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
            <StockPanel vnId={initialVnId} title={resolvedTitle ?? undefined} placeMap={placeMap} />
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
