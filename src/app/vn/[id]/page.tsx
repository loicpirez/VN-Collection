import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Box, Download, ExternalLink, Globe, Home, MapPin, Package, Star } from 'lucide-react';
import { getCollectionItem, isInCollection, listSeries, upsertVn } from '@/lib/db';
import { getVn } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { EditForm } from '@/components/EditForm';
import { StatusBadge } from '@/components/StatusBadge';
import { SafeImage } from '@/components/SafeImage';
import { MediaGallery } from '@/components/MediaGallery';
import { CoverUploader } from '@/components/CoverUploader';
import { BannerControls } from '@/components/BannerControls';
import { HeroBanner } from '@/components/HeroBanner';
import { DownloadAssetsButton } from '@/components/DownloadAssetsButton';
import { MarkdownView } from '@/components/MarkdownNotes';
import { CharactersSection } from '@/components/CharactersSection';
import { ReleasesSection } from '@/components/ReleasesSection';
import { QuotesSection } from '@/components/QuotesSection';
import type { BoxType, CollectionItem, EditionType, Location, Status } from '@/lib/types';

export const dynamic = 'force-dynamic';
const CACHE_MS = 24 * 3600 * 1000;

function fmtMinutes(m: number | null | undefined): string {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

function cleanDesc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2').replace(/\[\/?[a-z]+\]/gi, '');
}

async function loadVn(id: string): Promise<CollectionItem | null> {
  const cached = getCollectionItem(id);
  if (cached && Date.now() - cached.fetched_at < CACHE_MS) return cached;
  try {
    const fresh = await getVn(id);
    if (!fresh) return cached;
    upsertVn(fresh);
    return getCollectionItem(id);
  } catch {
    return cached;
  }
}

export default async function VnDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^v\d+$/i.test(id)) notFound();
  const t = await getDict();
  const vn = await loadVn(id);
  if (!vn) notFound();
  const inCol = isInCollection(id);
  const allSeries = listSeries();
  const status = (vn.status as Status | undefined) ?? null;
  const ratingNum = vn.rating != null ? (vn.rating / 10).toFixed(1) : '—';
  const visibleTags = (vn.tags ?? []).filter((tag) => tag.spoiler === 0).slice(0, 16);
  const heroImage = vn.custom_cover || vn.local_image || vn.image_url;
  const heroLocal = vn.custom_cover || vn.local_image;
  // Banner override: any local path or URL the user picked. Fallback to the cover.
  const bannerSource = vn.banner_image || vn.local_image || vn.image_url;
  const bannerIsUrl = bannerSource ? /^https?:\/\//i.test(bannerSource) : false;
  const bannerSrc = bannerSource ? (bannerIsUrl ? bannerSource : `/api/files/${bannerSource}`) : null;
  const customBanner = !!vn.banner_image;
  const location = (vn.location as Location | undefined) ?? 'unknown';
  const editionType = (vn.edition_type as EditionType | undefined) ?? 'none';
  const boxType = (vn.box_type as BoxType | undefined) ?? 'none';

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
        <HeroBanner
          vnId={vn.id}
          src={bannerSrc}
          customBanner={customBanner}
          initialPosition={vn.banner_position}
          inCollection={inCol}
        />

        <div className="relative -mt-44 grid grid-cols-1 gap-8 px-6 pb-6 md:grid-cols-[260px_1fr] md:px-8 md:pb-8">
          <div className="z-10 mx-auto w-full max-w-[260px] md:mx-0">
            <SafeImage
              src={heroImage}
              localSrc={heroLocal}
              alt={vn.title}
              sexual={vn.image_sexual ?? null}
              className="aspect-[2/3] w-full rounded-xl shadow-card"
            />
          </div>

          <div className="z-10 flex flex-col gap-3 pt-32 md:pt-44">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight md:text-3xl">{vn.title}</h1>
                {vn.alttitle && <div className="mt-1 text-muted">{vn.alttitle}</div>}
              </div>
              {status && <StatusBadge status={status} />}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="inline-flex items-baseline gap-1 text-3xl font-bold text-accent">
                <Star className="h-6 w-6 self-center fill-accent" aria-hidden /> {ratingNum}
              </span>
              <span className="text-sm text-muted">
                {t.detail.ratingOf10} · {vn.votecount ?? 0} {t.detail.votes}
              </span>
              {vn.user_rating != null && (
                <span className="ml-3 rounded-md bg-accent/15 px-2 py-1 text-xs font-bold text-accent">
                  {t.detail.myRatingLabel}: {(vn.user_rating / 10).toFixed(1)}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {vn.released && (
                <div>
                  <dt className="label">{t.detail.released}</dt>
                  <dd className="font-semibold">{vn.released}</dd>
                </div>
              )}
              <div>
                <dt className="label">{t.detail.lengthVndb}</dt>
                <dd className="font-semibold">{fmtMinutes(vn.length_minutes)}</dd>
              </div>
              <div>
                <dt className="label">{t.detail.myPlaytime}</dt>
                <dd className="font-semibold">{fmtMinutes(vn.playtime_minutes)}</dd>
              </div>
              {!!vn.languages?.length && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.languages}</dt>
                  <dd className="font-semibold">{vn.languages.slice(0, 8).join(', ')}</dd>
                </div>
              )}
              {!!vn.platforms?.length && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.platforms}</dt>
                  <dd className="font-semibold">{vn.platforms.slice(0, 10).join(', ')}</dd>
                </div>
              )}
              {!!vn.developers?.length && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.developers}</dt>
                  <dd className="flex flex-wrap gap-2 font-semibold">
                    {vn.developers.map((d) => (
                      <Link key={d.id} href={`/producer/${d.id}`} className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs hover:border-accent hover:text-accent">
                        {d.name}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            {inCol && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {location !== 'unknown' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1">
                    <MapPin className="h-3 w-3 text-accent" /> {t.locations[location]}
                  </span>
                )}
                {editionType !== 'none' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1">
                    <Package className="h-3 w-3 text-accent" /> {t.editions[editionType]}
                    {vn.edition_label && <span className="text-muted">· {vn.edition_label}</span>}
                  </span>
                )}
                {boxType !== 'none' && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1"
                    title={t.form.boxType}
                  >
                    <Box className="h-3 w-3 text-accent" /> {t.boxTypes[boxType]}
                  </span>
                )}
                {(vn.physical_location ?? []).map((place) => (
                  <Link
                    key={place}
                    href={`/?place=${encodeURIComponent(place)}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 transition-colors hover:border-accent hover:text-accent"
                    title={t.form.physicalLocation}
                  >
                    <Home className="h-3 w-3 text-accent" /> {place}
                  </Link>
                ))}
                {(vn.series ?? []).map((s) => (
                  <Link key={s.id} href={`/series/${s.id}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 hover:border-accent">
                    {s.name}
                  </Link>
                ))}
              </div>
            )}

            {visibleTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visibleTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/?tag=${encodeURIComponent(tag.id)}`}
                    className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                    title={t.library.filterByTag}
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`https://vndb.org/${vn.id}`} target="_blank" rel="noopener noreferrer" className="btn">
                <ExternalLink className="h-4 w-4" /> {t.detail.viewOnVndb}
              </a>
              {inCol && vn.download_url && (
                <a
                  href={vn.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  title={vn.download_url}
                >
                  <Download className="h-4 w-4" /> {t.form.downloadOpen}
                </a>
              )}
              {inCol && <DownloadAssetsButton vnId={vn.id} />}
            </div>
          </div>
        </div>

        {vn.description && (
          <div className="border-t border-border px-6 py-6 md:px-8">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.detail.synopsis}</h3>
            <p className="whitespace-pre-wrap leading-relaxed text-white/85">{cleanDesc(vn.description)}</p>
          </div>
        )}

        {(vn.screenshots.length > 0 || vn.release_images.length > 0) && (
          <div className="border-t border-border px-6 py-6 md:px-8">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.media.section}</h3>
            <MediaGallery vnId={vn.id} screenshots={vn.screenshots} releaseImages={vn.release_images} />
          </div>
        )}
      </div>

      {inCol && vn.notes && (
        <div className="mt-6 rounded-xl border border-border bg-bg-card p-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.form.personalNotes}</h3>
          <MarkdownView source={vn.notes} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        <CharactersSection vnId={vn.id} />
        <ReleasesSection vnId={vn.id} />
        <QuotesSection vnId={vn.id} />
      </div>

      {inCol && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <CoverUploader vnId={vn.id} hasCustom={!!vn.custom_cover} />
          <BannerControls vnId={vn.id} hasCustomBanner={customBanner} />
        </div>
      )}

      <div className="mt-6">
        <EditForm vn={vn} inCollection={inCol} allSeries={allSeries} />
      </div>
    </div>
  );
}
