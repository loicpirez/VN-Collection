'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListOrdered, Loader2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
import { decodeReadingQueueResponse } from '@/lib/tracking-client-shape';
/**
 * Toggle button: adds / removes the VN from the user's reading queue.
 * Lives next to the download buttons on /vn/[id].
 *
 * Reads the queue once on mount to decide which state to surface - the
 * server-side render already paints the queue list elsewhere so the extra
 * round-trip is harmless and keeps this component self-contained.
 */
export function QueueButton({ vnId }: { vnId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    const ownerVnId = vnId;
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setQueued(false);
    setBusy(false);
    const ac = new AbortController();
    fetch('/api/reading-queue', { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = decodeReadingQueueResponse(await r.json());
        if (!data) throw new Error(t.common.error);
        return data;
      })
      .then((d) => {
        if (ac.signal.aborted || identityRef.current !== ownerVnId) return;
        setQueued(d.entries.some((e) => e.vn_id === vnId));
      })
      .catch(() => undefined);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      ac.abort();
    };
  }, [vnId, t.common.error]);

  async function toggle() {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    const ownerVnId = vnId;
    setBusy(true);
    try {
      if (queued) {
        const r = await fetch(`/api/reading-queue?vn_id=${vnId}`, { method: 'DELETE', signal: controller.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        setQueued(false);
      } else {
        const r = await fetch('/api/reading-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vn_id: vnId }),
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        setQueued(true);
      }
      toast.success(t.toast.saved);
      router.refresh();
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        queued
          ? 'border-accent bg-accent text-bg hover:bg-accent/90'
          : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-white'
      }`}
      title={queued ? t.readingQueue.removeCta : t.readingQueue.addCta}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : queued ? <ListOrdered className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      {queued ? t.readingQueue.removeCta : t.readingQueue.addCta}
    </button>
  );
}
