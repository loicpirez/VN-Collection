'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
interface ListChip {
  id: number;
  name: string;
  color: string | null;
}

/**
 * Server-rendered strip of "this VN is in these lists" chips, with
 * one-click remove. Lives just under the title block on the VN detail
 * page when the membership set is non-empty. The companion
 * ListsPickerButton handles adding new memberships.
 */
export function VnListMemberships({ vnId, lists }: { vnId: string; lists: ListChip[] }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [removing, setRemoving] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setRemoving(null);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId]);

  if (lists.length === 0) return null;

  async function remove(list: ListChip) {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setRemoving(list.id);
    try {
      const r = await fetch(
        `/api/lists/${list.id}/items?vn=${encodeURIComponent(ownerVnId)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.lists.removedFrom.replace('{name}', list.name));
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setRemoving(null);
      }
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      <ListChecks className="h-3.5 w-3.5 text-muted" aria-hidden />
      <span className="text-xs font-bold uppercase tracking-widest text-muted">{t.lists.cardChip}</span>
      {lists.map((l) => (
        <span
          key={l.id}
          className="group inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/40 py-0.5 pl-1 pr-0.5"
          style={l.color ? { borderColor: `${l.color}77` } : undefined}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: l.color ?? '#475569' }}
            aria-hidden
          />
          <Link href={`/lists/${l.id}`} className="inline-flex min-h-[44px] items-center px-1 text-white/90 hover:text-accent sm:min-h-0">
            {l.name}
          </Link>
          <button
            type="button"
            onClick={() => remove(l)}
            disabled={removing !== null}
            aria-label={t.lists.removeFromList}
            title={t.lists.removeFromList}
            className="tap-target ml-0.5 inline-flex items-center justify-center rounded-full text-muted hover:bg-status-dropped/20 hover:text-status-dropped"
          >
            {removing === l.id ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <X className="h-3 w-3" aria-hidden />
            )}
          </button>
        </span>
      ))}
    </div>
  );
}
