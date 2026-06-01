'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';
import { decodeProducerRefreshSummary } from '@/lib/picker-client-shape';

/**
 * Per-page Refresh for the producer detail view. POSTs to
 * `/api/producer/[id]/refresh` which busts the developer-side
 * (POST /vn:producer) and publisher-side (POST /release:producer)
 * cache rows, then re-fetches both. On success we trigger a router
 * refresh so the surrounding server component renders the new data.
 *
 * Kept separate from the global refresh button because the producer
 * associations have their own per-page (paginated) cache keys not
 * covered by `/api/refresh/global`.
 */
export function ProducerRefreshButton({ producerId }: { producerId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const identityRef = useRef<string | null>(producerId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    inFlightRef.current = false;
    identityRef.current = producerId;
    setBusy(false);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      inFlightRef.current = false;
    };
  }, [producerId]);

  async function onClick() {
    if (inFlightRef.current) return;
    const ownerProducerId = producerId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/producer/${ownerProducerId}/refresh`, { method: 'POST', signal: controller.signal });
      if (!r.ok) {
        throw new Error(await readApiError(r, t.common.error));
      }
      const body = decodeProducerRefreshSummary(await r.json());
      if (!body) throw new Error(t.common.error);
      if (identityRef.current !== ownerProducerId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      const message = t.producerVns.refreshDone
        .replace('{devs}', String(body.developers))
        .replace('{pubs}', String(body.publishers))
        .replace('{owned}', String(body.owned));
      // When the data came from a stale-while-error fallback the
      // counts reflect the last-known cache, not the live truth.
      // We surface that as a "warning" toast (yellow tone) and
      // append the stale-data suffix so the user can decide to
      // retry once VNDB is healthy again.
      if (body.stale) {
        toast.warning(`${message} / ${t.producerVns.staleSuffix}`);
      } else {
        toast.success(message);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      if (identityRef.current !== ownerProducerId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((err as Error).message);
    } finally {
      if (identityRef.current === ownerProducerId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn inline-flex items-center gap-1.5 text-xs disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {busy ? t.producerVns.refreshing : t.producerVns.refresh}
    </button>
  );
}
