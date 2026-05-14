'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

export function ListRemoveVn({ listId, vnId }: { listId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${listId}/items?vn=${encodeURIComponent(vnId)}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={t.lists.removeFromList}
      title={t.lists.removeFromList}
      className="absolute right-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md bg-status-dropped/90 text-bg shadow-card hover:bg-status-dropped sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-4 w-4" />}
    </button>
  );
}
