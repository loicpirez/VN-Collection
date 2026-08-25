import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getProducerRepository } from '@/lib/db/repositories/producer';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { getDict, getLocale } from '@/lib/i18n/server';
import { ProducerLogo } from '@/components/ProducerLogo';
import { ProducerLogoUpload } from '@/components/ProducerLogoUpload';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { VndbMarkup } from '@/components/VndbMarkup';
import { ProducerVnsSections } from '@/components/ProducerVnsSections';
import { readScrapedProducerInfo, type ScrapedProducerInfo } from '@/lib/scrape-producer-relations';
import type { ProducerRow } from '@/lib/types';
import { DetailReorderLayout, type DetailSection } from '@/components/DetailReorderLayout';
import { safeHref } from '@/lib/safe-href';
import { ProducerVnsSkeleton } from '@/components/ProducerVnsSkeleton';
import { VNDB_CACHE_MS, isCacheFresh } from '@/lib/cache-age';
import { languageDisplayName } from '@/lib/language-names';
import {
  PRODUCER_DETAIL_LAYOUT_EVENT,
  PRODUCER_DETAIL_SETTINGS_KEY,
  PRODUCER_SECTION_IDS,
  parseProducerDetailLayoutV1,
} from '@/lib/producer-detail-layout';

export const dynamic = 'force-dynamic';

async function loadProducer(id: string): Promise<ProducerRow | null> {
  const repository = getProducerRepository();
  const cached = await repository.get(id);
  if (cached && isCacheFresh(cached.fetched_at, VNDB_CACHE_MS)) return cached;
  if (cached) return cached;
  try {
    const fresh = await fetchProducer(id);
    if (!fresh) return null;
    await repository.upsert(fresh);
    return repository.get(id);
  } catch {
    return null;
  }
}

const TYPE_KEY: Record<string, 'type_co' | 'type_in' | 'type_ng'> = {
  co: 'type_co',
  in: 'type_in',
  ng: 'type_ng',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const local = await getProducerRepository().get(id);
  return local?.name ? { title: local.name } : {};
}

export default async function ProducerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawScope = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  const scope = rawScope === 'collection' ? 'collection' : 'all';
  if (!/^p\d+$/i.test(id)) notFound();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const repository = getProducerRepository();
  const [loadedProducer, ownership, rawLayout] = await Promise.all([
    loadProducer(id),
    repository.ownershipSummary(id),
    getAppSettingRepository().get(PRODUCER_DETAIL_SETTINGS_KEY),
  ]);
  let producer = loadedProducer;
  // One focused query instead of two full `listCollection` scans:
  // returns the in-collection vn ids credited to this producer in
  // either role + the first row's developer/publisher arrays for the
  // fallback name path.
  const { ownedIds, sample: ownedSample } = ownership;
  if (!producer) {
    const sample =
      ownedSample?.developers?.find((d) => d.id === id) ??
      ownedSample?.publishers?.find((p) => p.id === id);
    if (!sample && ownedIds.size === 0) notFound();
    producer = {
      id,
      name: sample?.name ?? id,
      original: null,
      lang: null,
      type: null,
      description: null,
      aliases: [],
      extlinks: [],
      logo_path: null,
      fetched_at: 0,
    };
  }
  const typeKey = producer.type ? TYPE_KEY[producer.type] : null;
  const initialLayout = parseProducerDetailLayoutV1(rawLayout);
  const scrapedInfo = await readScrapedProducerInfo(producer.id);

  return (
    <DensityScopeProvider scope="producerWorks">
      <Link href="/producers" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.producers.back}
      </Link>

      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:flex-row sm:items-start sm:p-6">
        <ProducerLogo producer={producer} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-bold">{producer.name}</h1>
          {producer.original && producer.original !== producer.name && (
            <div className="text-sm text-muted">{producer.original}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {typeKey && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted">
                {t.producers[typeKey]}
              </span>
            )}
            {producer.lang && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted">
                {languageDisplayName(producer.lang, locale)}
              </span>
            )}
            {/*
              Explicit label: the header counts only VN already in
              the local collection that are credited to this producer
              (either role). The detail section below ("VN crédités
              sur VNDB") shows the full credited list with an
              owned/total breakdown, so an ambiguous "0 VN" here
              would contradict a "0/4 possédés" right below it.
              Use a label that names the slice.
            */}
            <span className="text-muted">
              {t.producers.ownedInCollection.replace('{n}', String(ownedIds.size))}
            </span>
          </div>
          {producer.aliases.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">{t.producers.aliases}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {producer.aliases.map((a) => (
                  <span key={a} className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-white/85">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <ProducerLogoUpload producerId={producer.id} hasLogo={!!producer.logo_path} />
        {/* Density slider - controls every VN grid below (dev + pub
            credit sections). Mounting on /producer/[id] closes the
            "missing slider on detail pages" consistency gap. */}
        <CardDensitySlider scope="producerWorks" />
      </div>

      {(() => {
        const sectionLabels = t.producerLayout.sectionLabels;
        const producerSections: DetailSection[] = [];

        if (producer.description) {
          producerSections.push({
            id: 'description',
            label: sectionLabels.description,
            node: (
              <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t.detail.synopsis}</h2>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                  <VndbMarkup text={producer.description} spoilerLabel={t.spoiler.markupSummary} />
                </div>
              </section>
            ),
          });
        }

        producerSections.push({
          id: 'extlinks',
          label: sectionLabels.extlinks,
          node: (
            <section className="mb-8 flex flex-wrap gap-2">
              <a
                href={`https://vndb.org/${producer.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> VNDB
              </a>
              {producer.extlinks.map((l) => {
                const href = safeHref(l.url);
                if (!href) return null;
                return (
                  <a
                    key={l.url}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {l.label}
                  </a>
                );
              })}
            </section>
          ),
        });

        producerSections.push({
          id: 'works',
          label: sectionLabels.works,
          node: (
            <Suspense fallback={<ProducerVnsSkeleton label={t.common.loading} />}>
              <ProducerVnsSections producerId={producer.id} scope={scope} />
            </Suspense>
          ),
        });

        producerSections.push({
          id: 'stats',
          label: sectionLabels.stats,
          node:
            scrapedInfo && scrapedInfo.relations.length > 0 ? (
              <ProducerScrapedRelations info={scrapedInfo} t={t} />
            ) : (
              <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                  {sectionLabels.stats}
                </h2>
                <p className="text-sm text-muted">{t.detail.emptySection}</p>
              </section>
            ),
        });

        return (
          <DetailReorderLayout
            sections={producerSections}
            initialLayout={initialLayout}
            sectionIds={PRODUCER_SECTION_IDS}
            settingsKey={PRODUCER_DETAIL_SETTINGS_KEY}
            eventName={PRODUCER_DETAIL_LAYOUT_EVENT}
            identityKey={id}
          />
        );
      })()}
    </DensityScopeProvider>
  );
}

/**
 * Renders the parent/subsidiary/spawned/imprint relations VNDB exposes
 * only on the web UI. Data is populated by the producer-scrape fan-out
 * (`scrapeProducersForVn`) when the user runs "Download all". The block
 * is hidden when nothing has been scraped yet so we don't show a stale
 * empty state.
 */
function ProducerScrapedRelations({
  info,
  t,
}: {
  info: ScrapedProducerInfo;
  t: Awaited<ReturnType<typeof getDict>>;
}) {
  return (
    <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.producers.scrapedRelations}</h2>
      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {info.relations.map((r) => (
          <li key={`${r.relation}-${r.id}`} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">{r.relation}</span>
            <Link href={`/producer/${r.id}`} className="font-semibold hover:text-accent">
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-muted/70">
        {t.producers.scrapedRelationsHint}
      </p>
    </section>
  );
}
