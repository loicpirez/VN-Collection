import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { getAppSetting, getSeries, listCollection } from '@/lib/db';
import { publicUrlFor } from '@/lib/files';
import { getDict } from '@/lib/i18n/server';
import { VnCard } from '@/components/VnCard';
import { toCardData } from '@/components/cardData';
import { SafeImage } from '@/components/SafeImage';
import { SeriesAddVnForm } from '@/components/SeriesAddVnForm';
import { SeriesRemoveVn } from '@/components/SeriesRemoveVn';
import { SeriesMetaEditor } from '@/components/SeriesMetaEditor';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { SeriesDetailLayout, type SeriesDetailSection } from '@/components/SeriesDetailLayout';
import { parseSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';

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
  const layout = parseSeriesDetailLayoutV1(getAppSetting('series_detail_section_layout_v1'));

  // Build the section list — each is wrapped into a slot the layout
  // host can reorder / hide / collapse. The grid sits inside `works`
  // so hiding it really hides the entire VN list.
  const heroSection = (
    <header className="overflow-hidden rounded-2xl border border-border bg-bg-card">
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
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{series.name}</h1>
          {series.description && (
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{series.description}</p>
          )}
          <div className="mt-2 text-xs text-muted">
            {items.length} {t.series.vnCount}
          </div>
        </div>
        <div className="shrink-0">
          <CardDensitySlider scope="seriesWorks" />
        </div>
      </div>
    </header>
  );

  const metadataSection = (
    <SeriesMetaEditor
      seriesId={series.id}
      initialName={series.name}
      initialDescription={series.description}
      initialCoverPath={series.cover_path}
      initialBannerPath={series.banner_path}
    />
  );

  const worksSection = (
    <div className="space-y-4">
      <SeriesAddVnForm seriesId={series.id} />
      {items.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.series.emptyDetail}</div>
      ) : (
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

  // Placeholders for future sections — keeping them in the layout
  // surface (even when empty) so the user's saved order stays valid
  // when content actually lands. Stable shape, free of real-title
  // examples.
  const relatedSection = (
    <div className="rounded-xl border border-dashed border-border bg-bg-card p-6 text-center text-xs text-muted">
      {t.series.empty}
    </div>
  );
  const statsSection = (
    <div className="rounded-xl border border-dashed border-border bg-bg-card p-6 text-center text-xs text-muted">
      {items.length} {t.series.vnCount}
    </div>
  );

  const sections: SeriesDetailSection[] = [
    { id: 'hero', node: heroSection },
    { id: 'works', node: worksSection },
    { id: 'metadata', node: metadataSection },
    { id: 'related', node: relatedSection },
    { id: 'stats', node: statsSection },
  ];

  return (
    <DensityScopeProvider scope="seriesWorks">
      <Link href="/series" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.series}
      </Link>

      <SeriesDetailLayout initialLayout={layout} sections={sections} />
    </DensityScopeProvider>
  );
}
