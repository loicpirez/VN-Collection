import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';
import { getSeriesRepository } from '@/lib/db/repositories/series';
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
import { SeriesDetailLayout } from '@/components/SeriesDetailLayout';
import { parseSeriesDetailLayoutV1, type SeriesSectionId } from '@/lib/series-detail-layout';
import { PaginatedGrid } from '@/components/PaginatedGrid';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return {};
  const series = await getSeriesRepository().get(n);
  return series ? { title: series.name } : {};
}

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) notFound();
  const repository = getSeriesRepository();
  const series = await repository.get(n);
  if (!series) notFound();
  const collectionRepository = getCollectionListRepository();
  const [t, rawItems, listCounts, queueIds, layoutSetting] = await Promise.all([
    getDict(),
    collectionRepository.listCards({ series: n }),
    collectionRepository.listMembershipCounts(),
    collectionRepository.readingQueueIds(),
    getAppSettingRepository().get('series_detail_section_layout_v1'),
  ]);
  const items = rawItems.map((it) => ({
    ...it,
    list_count: listCounts.get(it.id) ?? 0,
    in_reading_queue: queueIds.has(it.id),
  }));
  const layout = parseSeriesDetailLayoutV1(layoutSetting);

  // Build the section list - each is wrapped into a slot the layout
  // host can reorder / hide / collapse. The grid sits inside `works`
  // so hiding it really hides the entire VN list.
  const heroSection = (
    <header className="overflow-hidden rounded-2xl border border-border bg-bg-card">
      {series.banner_path && (
        <div className="h-40 w-full overflow-hidden bg-bg-elev">
          <SafeImage
            src={publicUrlFor(series.banner_path) ?? ''}
            alt={`${series.name} - ${t.series.banner}`}
            className="h-full w-full"
          />
        </div>
      )}
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-4 lg:contents">
          {series.cover_path ? (
            <SafeImage
              src={publicUrlFor(series.cover_path) ?? ''}
              alt={`${series.name} - ${t.series.cover}`}
              className="h-32 w-24 shrink-0 rounded-lg"
            />
          ) : (
            <Bookmark className="h-7 w-7 shrink-0 text-accent" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-bold">{series.name}</h1>
            {series.description && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{series.description}</p>
            )}
            <div className="mt-2 text-xs text-muted">
              {items.length} {t.series.vnCount}
            </div>
          </div>
        </div>
        <div className="min-w-0 lg:shrink-0">
          <CardDensitySlider scope="seriesWorks" className="w-full min-w-0 lg:w-auto" />
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
        <div className="rounded-xl border border-border bg-bg-card p-6 text-center text-sm text-muted">
          <Bookmark className="mx-auto mb-3 h-6 w-6 text-accent" aria-hidden />
          <p>{t.series.emptyDetail}</p>
        </div>
      ) : (
        <PaginatedGrid
          ariaLabel={series.name}
          resetKey={`series:${series.id}`}
          className="grid items-stretch gap-5"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {items.map((it) => (
            <li key={it.id} className="group relative flex min-h-0 min-w-0 items-stretch">
              <SeriesRemoveVn seriesId={series.id} vnId={it.id} />
              <VnCard data={toCardData(it)} />
            </li>
          ))}
        </PaginatedGrid>
      )}
    </div>
  );

  const sectionNodes: Partial<Record<SeriesSectionId, React.ReactNode>> = {
    hero: heroSection,
    works: worksSection,
    metadata: metadataSection,
  };

  return (
    <DensityScopeProvider scope="seriesWorks">
      <Link href="/series" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.series}
      </Link>

      <SeriesDetailLayout seriesId={series.id} initialLayout={layout} sectionNodes={sectionNodes} />
    </DensityScopeProvider>
  );
}
