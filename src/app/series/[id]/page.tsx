import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { getSeries, listCollection } from '@/lib/db';
import { publicUrlFor } from '@/lib/files';
import { getDict } from '@/lib/i18n/server';
import { VnCard } from '@/components/VnCard';
import { toCardData } from '@/components/cardData';
import { SafeImage } from '@/components/SafeImage';
import { SeriesAddVnForm } from '@/components/SeriesAddVnForm';
import { SeriesRemoveVn } from '@/components/SeriesRemoveVn';
import { SeriesMetaEditor } from '@/components/SeriesMetaEditor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return {};
  const series = getSeries(n);
  return series ? { title: series.name } : {};
}

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

      <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card">
        {series.banner_path && (
          <div className="h-40 w-full overflow-hidden bg-bg-elev">
            <SafeImage
              src={publicUrlFor(series.banner_path) ?? ''}
              alt={`${series.name} — ${t.series.banner}`}
              className="h-full w-full"
            />
          </div>
        )}
        <div className="flex items-start gap-4 p-6">
          {series.cover_path ? (
            <SafeImage
              src={publicUrlFor(series.cover_path) ?? ''}
              alt={`${series.name} — ${t.series.cover}`}
              className="h-32 w-24 shrink-0 rounded-lg"
            />
          ) : (
            <Bookmark className="h-7 w-7 text-accent" aria-hidden />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{series.name}</h1>
            {series.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{series.description}</p>}
            <div className="mt-2 text-xs text-muted">
              {items.length} {t.series.vnCount}
            </div>
          </div>
        </div>
      </header>

      <div className="mb-6">
        <SeriesMetaEditor
          seriesId={series.id}
          initialName={series.name}
          initialDescription={series.description}
          initialCoverPath={series.cover_path}
          initialBannerPath={series.banner_path}
        />
      </div>

      <div className="mb-6">
        <SeriesAddVnForm seriesId={series.id} />
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.series.emptyDetail}</div>
      ) : (
        // Density-aware grid (was hard `grid-cols-2..xl:grid-cols-6`).
        // Matches the canonical listing template; the density slider
        // now governs the column count on this page too.
        <div
          className="grid gap-5"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {items.map((it) => (
            <div key={it.id} className="group relative">
              <SeriesRemoveVn seriesId={series.id} vnId={it.id} />
              <VnCard data={toCardData(it)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
