'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
const VN_ID = /^v\d+$/i;
const EGS_ID = /^egs_\d+$/i;

export function ListAddVnForm({ listId }: { listId: number }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const identityRef = useRef<number | null>(listId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    inFlightRef.current = false;
    identityRef.current = listId;
    setValue('');
    setBusy(false);
    return () => {
      identityRef.current = null;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [listId]);

  async function submit() {
    const ownerListId = listId;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || inFlightRef.current) return;
    if (!VN_ID.test(trimmed) && !EGS_ID.test(trimmed)) {
      toast.error(t.series.invalidListVnId);
      return;
    }
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${ownerListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: trimmed }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerListId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setValue('');
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerListId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerListId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.series.addVnPlaceholder}
        aria-label={t.series.addVn}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="input min-w-[140px] sm:min-w-[180px] flex-1"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || value.trim().length === 0}
        className="btn btn-primary"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        {t.series.addVn}
      </button>
    </div>
  );
}
