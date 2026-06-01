'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
export function ListRemoveVn({ listId, vnId }: { listId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const ownerKey = `${listId}|${vnId}`;
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
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [ownerKey]);

  async function remove() {
    if (inFlightRef.current) return;
    const owner = ownerKey;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${listId}/items?vn=${encodeURIComponent(vnId)}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === owner && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={t.lists.removeFromList}
      title={t.lists.removeFromList}
      className="tap-target absolute right-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md bg-status-dropped/90 text-bg shadow-card hover:bg-status-dropped can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
    </button>
  );
}
