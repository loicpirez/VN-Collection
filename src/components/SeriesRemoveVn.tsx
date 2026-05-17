'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';

/**
 * Per-VN remove-from-series chip overlaid on the series detail page
 * card grid. Previously fired the DELETE immediately — one stray click
 * over the X icon used to silently rip a VN out of a series, with no
 * undo path on the UI. The destructive action now routes through the
 * shared `useConfirm` so the user gets a Cancel out of the way before
 * the network call. Tracking data on the VN itself is preserved (only
 * the series ↔ VN edge is dropped), so the confirm copy says so.
 */
export function SeriesRemoveVn({ seriesId, vnId }: { seriesId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const { confirm } = useConfirm();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-status-dropped md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      aria-label={t.series.removeFromSeries}
      title={t.series.removeFromSeries}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirm({
          message: t.series.removeFromSeriesConfirm,
          tone: 'danger',
        });
        if (!ok) return;
        await fetch(`/api/series/${seriesId}/vn/${vnId}`, { method: 'DELETE' });
        startTransition(() => router.refresh());
      }}
      disabled={pending}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
