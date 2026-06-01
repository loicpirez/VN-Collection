'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

export function SeriesRemoveVn({ seriesId, vnId }: { seriesId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const ownerKey = `${seriesId}|${vnId}`;
  const identityRef = useRef<string | null>(ownerKey);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    inFlightRef.current = false;
    identityRef.current = ownerKey;
    setBusy(false);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      inFlightRef.current = false;
    };
  }, [ownerKey]);

  return (
    <button
      className="tap-target absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-status-dropped can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      aria-label={t.series.removeFromSeries}
      title={t.series.removeFromSeries}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inFlightRef.current) return;
        const owner = ownerKey;
        inFlightRef.current = true;
        const controller = new AbortController();
        mutationAbortRef.current?.abort();
        mutationAbortRef.current = controller;
        setBusy(true);
        const ok = await confirm({
          message: t.series.removeFromSeriesConfirm,
          tone: 'danger',
        });
        if (!ok || identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) {
          if (identityRef.current === owner && mutationAbortRef.current === controller) {
            mutationAbortRef.current = null;
            inFlightRef.current = false;
            setBusy(false);
          }
          return;
        }
        try {
          const r = await fetch(`/api/series/${seriesId}/vn/${vnId}`, { method: 'DELETE', signal: controller.signal });
          if (!r.ok) throw new Error(await readApiError(r, t.common.error));
          if (identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) return;
          startTransition(() => router.refresh());
        } catch (err) {
          if (identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) return;
          toast.error((err as Error).message);
        } finally {
          if (identityRef.current === owner && mutationAbortRef.current === controller) {
            mutationAbortRef.current = null;
            inFlightRef.current = false;
            setBusy(false);
          }
        }
      }}
      disabled={pending || busy}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
