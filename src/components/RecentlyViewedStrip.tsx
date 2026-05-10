'use client';
import Link from 'next/link';
import { Clock, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useRecentlyViewed } from '@/lib/recentlyViewed';
import { useT } from '@/lib/i18n/client';

export function RecentlyViewedStrip() {
  const t = useT();
  const { items, clear } = useRecentlyViewed();

  if (items.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
          <Clock className="h-3.5 w-3.5 text-accent" /> {t.recently.title}
          <span className="text-[10px] font-normal opacity-70">· {items.length}</span>
        </h2>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded text-[11px] text-muted hover:text-status-dropped"
          title={t.recently.clear}
        >
          <X className="h-3 w-3" /> {t.recently.clear}
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/vn/${it.id}`}
            className="group flex w-24 shrink-0 flex-col gap-1"
            title={it.title}
          >
            <div className="aspect-[2/3] w-24 overflow-hidden rounded-md border border-border transition-colors group-hover:border-accent">
              <SafeImage
                src={it.poster}
                localSrc={it.localPoster}
                sexual={it.sexual}
                alt={it.title}
                className="h-full w-full"
              />
            </div>
            <span className="line-clamp-2 text-[10px] leading-tight text-muted transition-colors group-hover:text-white">
              {it.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
