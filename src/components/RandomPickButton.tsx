'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dices, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { fetchAllCollectionItems } from '@/lib/collection-api-client';
import { decodeCollectionCompareRow } from '@/lib/collection-client-shape';

interface Props {
  /** Ids of the VNs on the loaded page (post-filter, pre-grouping). Used for the disabled state and as a fallback if the full fetch fails. */
  candidates: { id: string; title: string }[];
  /** Active collection query params (every filter/sort except page) so the pick spans the entire filtered set, not just the loaded page. */
  queryParams: URLSearchParams;
}

/**
 * One-click "what should I play next" picker. Pulls the entire filtered
 * collection via the bounded collection API before choosing so the pick
 * is uniform across every match instead of biased toward the loaded
 * page. Navigates straight to the picked VN's detail page so the user
 * can start reading immediately.
 *
 * Disabled when no candidates remain on the loaded page - surfacing the
 * empty state visually is more useful than a no-op click.
 */
export function RandomPickButton({ candidates, queryParams }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  async function pick() {
    if (candidates.length === 0 || picking) return;
    setPicking(true);
    let pool: { id: string; title: string }[] = candidates;
    try {
      const all = await fetchAllCollectionItems(
        queryParams,
        decodeCollectionCompareRow,
        {},
        t.common.error,
      );
      if (all.length > 0) pool = all.map((it) => ({ id: it.id, title: it.title }));
    } catch {
      pool = candidates;
    } finally {
      setPicking(false);
    }
    if (pool.length === 0) return;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    toast.success(`${t.library.randomPick.picked} - ${choice.title}`);
    router.push(`/vn/${choice.id}`);
  }

  return (
    <button
      type="button"
      onClick={pick}
      disabled={candidates.length === 0 || picking}
      className="btn inline-flex items-center gap-1 disabled:opacity-50"
      title={
        candidates.length === 0
          ? t.library.randomPick.empty
          : t.library.randomPick.title
      }
    >
      {picking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Dices className="h-4 w-4" aria-hidden />}
      {t.library.randomPick.cta}
    </button>
  );
}
