'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

export function SeriesRemoveVn({ seriesId, vnId }: { seriesId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="tap-target absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-status-dropped can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
        try {
          const r = await fetch(`/api/series/${seriesId}/vn/${vnId}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await readApiError(r, t.common.error));
          startTransition(() => router.refresh());
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
      disabled={pending}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
