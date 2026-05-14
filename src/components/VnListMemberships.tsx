'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

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

  if (lists.length === 0) return null;

  async function remove(list: ListChip) {
    setRemoving(list.id);
    try {
      const r = await fetch(
        `/api/lists/${list.id}/items?vn=${encodeURIComponent(vnId)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.lists.removedFrom.replace('{name}', list.name));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      <ListChecks className="h-3.5 w-3.5 text-muted" aria-hidden />
      <span className="font-bold uppercase tracking-wider text-muted">{t.lists.cardChip}</span>
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
          <Link href={`/lists/${l.id}`} className="px-1 text-white/90 hover:text-accent">
            {l.name}
          </Link>
          <button
            type="button"
            onClick={() => remove(l)}
            disabled={removing === l.id}
            aria-label={t.lists.removeFromList}
            title={t.lists.removeFromList}
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-status-dropped/20 hover:text-status-dropped"
          >
            {removing === l.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        </span>
      ))}
    </div>
  );
}
