'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { readApiError } from '@/lib/api-error-read';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface Props {
  vnId: string;
  ignored: boolean;
}

/** Toggle whether one VN contributes to active dump-tracker lists and totals. */
export function DumpIgnoreButton({ vnId, ignored }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setBusy(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId]);

  async function toggle() {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/collection/${ownerVnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dumped_ignored: !ignored }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readApiError(response, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(ignored ? t.dumped.restored : t.dumped.ignored);
      startTransition(() => router.refresh());
    } catch (error) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((error as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  const label = ignored ? t.dumped.restore : t.dumped.ignore;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-bg-card/80 px-2 py-1 text-[10px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-50"
      title={label}
      aria-label={label}
    >
      {busy
        ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        : ignored
          ? <Eye className="h-3 w-3 shrink-0" aria-hidden />
          : <EyeOff className="h-3 w-3 shrink-0" aria-hidden />}
      <span>{label}</span>
    </button>
  );
}
