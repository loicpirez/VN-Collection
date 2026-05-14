'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

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

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/producer/${producerId}/refresh`, { method: 'POST' });
      const body = (await r.json().catch(() => ({}))) as {
        error?: string;
        developers?: number;
        publishers?: number;
        owned?: number;
        upstreamFailed?: boolean;
      };
      if (!r.ok) {
        throw new Error(body.error || t.common.error);
      }
      // Defensive check against the route ever changing shape — a
      // schema drift used to print "undefined dev / undefined pub"
      // in the toast.
      const devs = typeof body.developers === 'number' ? body.developers : 0;
      const pubs = typeof body.publishers === 'number' ? body.publishers : 0;
      const owned = typeof body.owned === 'number' ? body.owned : 0;
      toast.success(
        t.producerVns.refreshDone
          .replace('{devs}', String(devs))
          .replace('{pubs}', String(pubs))
          .replace('{owned}', String(owned)),
      );
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn inline-flex items-center gap-1.5 text-xs disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {busy ? t.producerVns.refreshing : t.producerVns.refresh}
    </button>
  );
}
