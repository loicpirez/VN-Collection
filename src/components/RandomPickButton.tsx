'use client';
import { useRouter } from 'next/navigation';
import { Dices } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

interface Props {
  /** Ids of the VNs currently visible (post-filter, pre-grouping). */
  candidates: { id: string; title: string }[];
}

/**
 * One-click "what should I play next" picker. Respects every active filter
 * via the caller passing the already-filtered list. Navigates straight to
 * the picked VN's detail page so the user can start reading immediately.
 *
 * Disabled when no candidates remain — surfacing the empty state visually
 * is more useful than a no-op click.
 */
export function RandomPickButton({ candidates }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  function pick() {
    if (candidates.length === 0) return;
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    toast.success(`${t.library.randomPick.picked} — ${choice.title}`);
    router.push(`/vn/${choice.id}`);
  }

  return (
    <button
      type="button"
      onClick={pick}
      disabled={candidates.length === 0}
      className="btn inline-flex items-center gap-1 disabled:opacity-50"
      title={
        candidates.length === 0
          ? t.library.randomPick.empty
          : `${t.library.randomPick.title} (${candidates.length})`
      }
    >
      <Dices className="h-4 w-4" />
      {t.library.randomPick.cta}
    </button>
  );
}
