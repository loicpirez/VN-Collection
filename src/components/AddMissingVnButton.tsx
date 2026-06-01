'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
/**
 * Small "+" affordance for missing-VN rows on the producer completion
 * panel. Triggers POST /api/collection/{vnId} with status=planning and
 * refreshes the surrounding server component so the row drops out of the
 * "missing" list. Designed to render inside a row that is itself a Link -
 * the button stops propagation so clicking it doesn't navigate.
 */
export function AddMissingVnButton({ vnId }: { vnId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [, startTransition] = useTransition();
  const identityRef = useRef<string | null>(vnId);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    identityRef.current = vnId;
    inFlightRef.current = false;
    setBusy(false);
    setDone(false);
    return () => {
      identityRef.current = null;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inFlightRef.current || done) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${ownerVnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.added);
      setDone(true);
      startTransition(() => router.refresh());
    } catch (err) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((err as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
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
      disabled={busy || done}
      aria-label={t.coverActions.addToCollection}
      className="tap-target inline-flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-md border border-border bg-bg-card text-muted transition-colors hover:border-accent hover:bg-accent hover:text-bg disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : done ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
