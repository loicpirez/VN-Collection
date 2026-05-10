import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { getSeries, listCollection } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { VnCard } from '@/components/VnCard';
import { SeriesAddVnForm } from '@/components/SeriesAddVnForm';
import { SeriesRemoveVn } from '@/components/SeriesRemoveVn';
import type { Status } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) notFound();
  const series = getSeries(n);
  if (!series) notFound();
  const t = await getDict();
  const items = listCollection({ series: n });

  return (
    <div>
      <Link href="/series" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.series}
      </Link>

      <header className="mb-6 flex items-start gap-4 rounded-2xl border border-border bg-bg-card p-6">
        <Bookmark className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{series.name}</h1>
          {series.description && <p className="mt-1 text-sm text-muted">{series.description}</p>}
          <div className="mt-2 text-xs text-muted">
            {items.length} {t.series.vnCount}
          </div>
        </div>
      </header>

      <div className="mb-6">
        <SeriesAddVnForm seriesId={series.id} />
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.library.empty.descriptionFiltered}</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => (
            <div key={it.id} className="group relative">
              <SeriesRemoveVn seriesId={series.id} vnId={it.id} />
              <VnCard
                data={{
                  id: it.id,
                  title: it.title,
                  poster: it.image_thumb || it.image_url,
                  localPoster: it.local_image_thumb || it.local_image,
                  customCover: it.custom_cover,
                  sexual: it.image_sexual,
                  released: it.released,
                  rating: it.rating,
                  user_rating: it.user_rating,
                  playtime_minutes: it.playtime_minutes,
                  length_minutes: it.length_minutes,
                  status: it.status as Status | undefined,
                  favorite: it.favorite,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
