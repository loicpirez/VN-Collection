'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export function SeriesRemoveVn({ seriesId, vnId }: { seriesId: number; vnId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-status-dropped sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      aria-label={t.series.removeFromSeries}
      title={t.series.removeFromSeries}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await fetch(`/api/series/${seriesId}/vn/${vnId}`, { method: 'DELETE' });
        startTransition(() => router.refresh());
      }}
      disabled={pending}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
