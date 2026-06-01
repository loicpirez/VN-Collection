import type { Metadata } from 'next';
import { cache } from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { ArrowLeft, Box, ChevronRight, Disc3, ExternalLink, HardDriveDownload, Home, MapPin, Package, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import {
  deriveVnAspectDisplay,
  deriveVnAspectKey,
  getAppSetting,
  getCollectionItem,
  getCoOccurringTags,
  getEgsForVn,
  getSourcePref,
  getVnAspectOverride,
  isEgsOnly,
  isInCollection,
  isInCollectionMany,
  listActivityForVn,
  listGameLogForVn,
  listListsForVn,
  listSeries,
  materializeReleaseAspectsForVn,
  materializeReleaseMetaForVn,
  upsertVn,
} from '@/lib/db';
import { parseVnDetailLayoutV1, type VnSectionId } from '@/lib/vn-detail-layout';
import { platformLabel } from '@/lib/platform-label';
import { VnDetailLayout } from '@/components/VnDetailLayout';
import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';
import { AspectOverrideControl } from '@/components/AspectOverrideControl';
import { getVn } from '@/lib/vndb';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

import { formatMinutesWithDash as fmtMinutes } from '@/lib/format';
import { getDict, getLocale } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n/dictionaries';
import { fmtNum, formatVndbDateString } from '@/lib/locale-number';
import { EditForm } from '@/components/EditForm';
import { StatusBadge } from '@/components/StatusBadge';
import { SafeImage } from '@/components/SafeImage';
import { CoverUploader } from '@/components/CoverUploader';

import { HeroBanner } from '@/components/HeroBanner';

import { CastSection } from '@/components/CastSection';
import { StaffSection } from '@/components/StaffSection';
import { TagCoOccurrence } from '@/components/TagCoOccurrence';
import { ReadingSpeedBadge } from '@/components/ReadingSpeedBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { SeriesAutoSuggest } from '@/components/SeriesAutoSuggest';
import { detectSeriesForVn } from '@/lib/series-detect';
import { SessionPanel } from '@/components/SessionPanel';
import { CoverEditOverlay } from '@/components/CoverEditOverlay';
import { CoverHero } from '@/components/CoverHero';
import { CoverRotationButtons } from '@/components/CoverRotationButtons';
import { VnListMemberships } from '@/components/VnListMemberships';
import { PlaytimeCompare } from '@/components/PlaytimeCompare';
import { SmartStatusHint } from '@/components/SmartStatusHint';
import { VnDetailActionsBar } from '@/components/VnDetailActionsBar';
import { NotesSectionToggle } from '@/components/NotesSectionToggle';
import { ScoreSection } from '@/components/ScoreSection';
import { OwnedEditionsSection } from '@/components/OwnedEditionsSection';
import { LangList } from '@/components/LangFlag';
import { RelationsSection } from '@/components/RelationsSection';
import { RecordRecentView } from '@/components/RecordRecentView';
import { NotInCollectionBanner } from '@/components/NotInCollectionBanner';
import { TitleLine } from '@/components/TitleLine';
import { StockPanelBoundary } from '@/components/StockPanelBoundary';
import { StockPricesSection } from '@/components/StockPricesSection';
import { getStockForVn } from '@/lib/stock';
import { decodeStoredExtras } from '@/lib/erogeprice-meta';
import { EgsPanel } from '@/components/EgsPanel';
import { EgsRichDetails } from '@/components/EgsRichDetails';
import { MatchBadges } from '@/components/MatchBadges';
import { VndbStatusPanel } from '@/components/VndbStatusPanel';
import { FieldCompare } from '@/components/FieldCompare';
import { CustomSynopsis } from '@/components/CustomSynopsis';
import { BrandCompare } from '@/components/BrandCompare';
import { CoverCompare } from '@/components/CoverCompare';
import { VnTagsGroupedView } from '@/components/VnTagsGroupedView';
import type { BoxType, CollectionItem, EditionType, Location, Status } from '@/lib/types';

import { isVndbVnId } from '@/lib/vn-id-shape';
import { VNDB_CACHE_MS, isCacheFresh } from '@/lib/cache-age';
import { getPlaceProviderMap } from '@/lib/db';

const MediaGallery = nextDynamic(() => import('@/components/MediaGallery').then((m) => m.MediaGallery), {
  loading: () => (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={i} className="aspect-video h-28 shrink-0" />
      ))}
    </div>
  ),
});

const CharactersSection = nextDynamic(() => import('@/components/CharactersSection').then((m) => m.CharactersSection), {
  loading: () => <SkeletonRows count={4} />,
});

const RoutesSection = nextDynamic(() => import('@/components/RoutesSection').then((m) => m.RoutesSection), {
  loading: () => <SkeletonRows count={3} withThumb={false} />,
});

const QuotesSection = nextDynamic(() => import('@/components/QuotesSection').then((m) => m.QuotesSection), {
  loading: () => <SkeletonRows count={3} withThumb={false} />,
});

const ReleasesSection = nextDynamic(() => import('@/components/ReleasesSection').then((m) => m.ReleasesSection), {
  loading: () => <SkeletonRows count={4} />,
});

const StockPanel = nextDynamic(() => import('@/components/StockPanel').then((m) => m.StockPanel), {
  loading: () => <SkeletonRows count={4} />,
});

export const dynamic = 'force-dynamic';

function combinedScore(vndb: number | null, egs: number | null): number | null {
  if (vndb == null && egs == null) return null;
  if (vndb == null) return egs;
  if (egs == null) return vndb;
  return Math.round((vndb + egs) / 2);
}

function titleCandidates(vn: CollectionItem): string[] {
  const candidates = [
    vn.title,
    vn.alttitle,
    ...vn.titles.flatMap((title) => [title.title, title.latin]),
  ];
  return candidates
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
}

function displayTitleForVn(vn: CollectionItem): string {
  const current = vn.title.trim();
  const normalized = current.toLocaleLowerCase();
  const longerContainingCurrent = titleCandidates(vn)
    .filter((candidate) => {
      const lower = candidate.toLocaleLowerCase();
      return lower !== normalized && lower.includes(normalized) && candidate.length > current.length;
    })
    .sort((a, b) => a.length - b.length)[0];
  return longerContainingCurrent ?? current;
}

/**
 * Resolve a VN id to its on-screen detail data.
 *
 * Wrapped with React.cache so `generateMetadata` and the page
 * body share one fetch per request. Without this, the metadata
 * pre-pass would fall back to the raw VN id ("v12345") whenever
 * the user opened a VN that wasn't yet in the local `vn` table —
 * notably any VNDB-linked entry surfaced from an external feed
 * (EGS top-ranked map links, recommendations of non-collection
 * VNs, etc.). Opening such a link used to render
 *   <title>v12345 · VN Collection</title>
 * while the page body itself showed the correct title — manual QA
 * flagged this as the "vn(id) - VN Collection" bug.
 *
 * The function never auto-adds the VN to the collection —
 * `upsertVn` writes to the `vn` cache table only. Membership in
 * `collection` stays under explicit operator control.
 */
const loadVn = cache(
  async (id: string): Promise<{ vn: CollectionItem | null; error: string | null }> => {
    const cached = getCollectionItem(id);
    // EGS-only synthetic VNs aren't on VNDB — always serve from cache.
    if (isEgsOnly(id)) {
      return { vn: cached, error: null };
    }
    if (cached && isCacheFresh(cached.fetched_at, VNDB_CACHE_MS)) return { vn: cached, error: null };
    try {
      const fresh = await getVn(id);
      if (!fresh) {
        if (cached) return { vn: cached, error: null };
        const t = await getDict();
        return { vn: null, error: t.detail.vndbNoResult.replace('{id}', id) };
      }
      upsertVn(fresh);
      return { vn: getCollectionItem(id), error: null };
    } catch (e) {
      const msg = (e as Error).message || '';
      if (cached) return { vn: cached, error: null };
      return { vn: null, error: msg };
    }
  },
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawId } = await params;
  const candidateId = decodeURIComponent(rawId).replace(/^egs:/, 'egs_');
  // Sanity-check id shape; on garbage we fall through to the raw
  // string fallback rather than triggering the cache(...) path
  // that may hit VNDB with a malformed id.
  if (!isValidVnId(candidateId)) {
    return { title: candidateId };
  }
  const id = normalizeVnId(candidateId);
  // Share the same resolved VN row with the page body via
  // React.cache. For a VN already cached in `vn`, this returns
  // the row immediately; for a not-yet-seen VNDB id we fetch
  // and upsert ONCE per request.
  const { vn } = await loadVn(id);
  const title = vn ? displayTitleForVn(vn) : `VN ${id}`;
  return { title };
}

export default async function VnDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id: rawId } = await params;
  const search = await searchParams;
  // Per-section "Spoil me" override sourced from the URL. Forwarded
  // to the tag and trait sections so a `?spoil=2` deep link reveals
  // every spoiler on the page without flipping the global setting.
  const spoilOverride = (() => {
    const raw = search.spoil;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === '0') return 0 as const;
    if (v === '1') return 1 as const;
    if (v === '2') return 2 as const;
    return null;
  })();
  // Next gives us URL-encoded dynamic params (e.g. `egs%3A894`); decode once
  // so the rest of the page doesn't care. Legacy `egs:NNNN` form is still
  // accepted here — the startup migration converts them to `egs_NNNN`.
  const candidateId = decodeURIComponent(rawId).replace(/^egs:/, 'egs_');
  if (!isValidVnId(candidateId)) notFound();
  const id = normalizeVnId(candidateId);
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const { vn, error } = await loadVn(id);
  if (!vn) {
    if (error) {
      console.warn(`[vn/${id}] upstream lookup failed:`, error);
    }
    return (
      <div className="mx-auto max-w-2xl">
        {/*
          Back link — mobile-only. Desktop has the navbar; rendering
          a wide back row above the hero wasted vertical space on
          every detail page. `md:hidden` collapses the entire
          element at md+ so no margin / padding / border is reserved.
        */}
        <Link
          href="/"
          aria-label={t.nav.library}
          title={t.nav.library}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>{t.nav.library}</span>
        </Link>
        <div className="rounded-2xl border border-status-dropped/40 bg-status-dropped/5 p-6">
          <h1 className="mb-2 text-xl font-bold text-status-dropped">{t.detail.notFoundTitle}</h1>
          <p className="text-sm text-muted">{t.detail.notFoundBody.replace('{id}', id)}</p>
          {error && (
            // Surface a generic line — full upstream message is sent to the
            // server log (where the operator can grep it) rather than dumped
            // verbatim into the page (which can leak stack traces). See
            <p className="mt-3 text-xs text-status-dropped/80">{t.common.error}</p>
          )}
          <p className="mt-4 text-xs text-muted">
            <a
              href={`https://vndb.org/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              {t.detail.openOnVndb} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </div>
      </div>
    );
  }
  const inCol = isInCollection(id);
  const displayTitle = displayTitleForVn(vn);
  const resolvedAltTitle =
    vn.alttitle && vn.alttitle !== displayTitle
      ? vn.alttitle
      : displayTitle !== vn.title
        ? vn.title
        : vn.alttitle;
  const displayAltTitle = resolvedAltTitle !== displayTitle ? resolvedAltTitle : undefined;
  const allSeries = listSeries();
  const listsForThisVn = listListsForVn(id);
  if (isVndbVnId(vn.id)) {
    const vnIdToMaterialize = vn.id;
    after(() => {
      materializeReleaseAspectsForVn(vnIdToMaterialize);
      materializeReleaseMetaForVn(vnIdToMaterialize);
    });
  }
  const status = (vn.status as Status | undefined) ?? null;
  // Per-field source preference (VNDB / EGS / Custom) — pulled per-VN, defaults to Auto.
  const egsRow = getEgsForVn(vn.id);
  const vndbRating = vn.rating ?? null;
  const egsRating = egsRow?.median ?? null;
  const unifiedRating = combinedScore(vndbRating, egsRating);
  const unifiedRatingSource =
    vndbRating != null && egsRating != null ? t.detail.scoreUnifiedBoth
    : vndbRating != null ? t.detail.scoreUnifiedVndb
    : egsRating != null ? t.detail.scoreUnifiedEgs
    : t.detail.scoreUnavailable;
  const sourcePref = getSourcePref(vn.id);
  // Three independent poster sources so the compare panel can show them
  // side-by-side without conflating custom into the VNDB column.
  const vndbPoster = {
    remote: vn.image_url ?? null,
    local: vn.local_image ?? null,
  };
  const egsPoster = {
    remote: egsRow?.image_url ?? null,
    local: egsRow?.local_image ?? null,
  };
  const customPoster = {
    remote: vn.custom_cover && /^https?:\/\//i.test(vn.custom_cover) ? vn.custom_cover : null,
    local: vn.custom_cover && !/^https?:\/\//i.test(vn.custom_cover) ? vn.custom_cover : null,
  };
  const vndbPosterHas = !!(vndbPoster.remote || vndbPoster.local);
  const egsPosterHas = !!(egsPoster.remote || egsPoster.local);
  const customPosterHas = !!(customPoster.remote || customPoster.local);
  // Hero resolution priority: explicit pref > custom > vndb > egs.
  const imagePref = sourcePref.image ?? 'auto';
  let heroPoster = vndbPoster;
  if (imagePref === 'custom' && customPosterHas) heroPoster = customPoster;
  else if (imagePref === 'egs' && egsPosterHas) heroPoster = egsPoster;
  else if (imagePref === 'vndb' && vndbPosterHas) heroPoster = vndbPoster;
  else if (customPosterHas) heroPoster = customPoster;
  else if (vndbPosterHas) heroPoster = vndbPoster;
  else if (egsPosterHas) heroPoster = egsPoster;
  // Banner override: only render a banner when the user explicitly picked one.
  const bannerSource = vn.banner_image;
  const bannerIsUrl = bannerSource ? /^https?:\/\//i.test(bannerSource) : false;
  const bannerSrc = bannerSource ? (bannerIsUrl ? bannerSource : `/api/files/${bannerSource}`) : null;
  const customBanner = !!vn.banner_image;
  const location = (vn.location as Location | undefined) ?? 'unknown';
  const editionType = (vn.edition_type as EditionType | undefined) ?? 'none';
  const boxType = (vn.box_type as BoxType | undefined) ?? 'none';
  const isFanDisc = (vn.relations ?? []).some((r) => r.relation === 'orig');

  return (
    <div className="w-full">
      <RecordRecentView
        id={vn.id}
        title={displayTitle}
        poster={vn.image_url || vn.image_thumb}
        localPoster={vn.local_image || vn.local_image_thumb}
        sexual={vn.image_sexual}
      />
      {/*
        Back link — mobile-only. See the not-found branch above
        for the rationale. Desktop has the navbar; no back chip
        is rendered there.
      */}
      <Link
        href="/"
        aria-label={t.nav.library}
        title={t.nav.library}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span>{t.nav.library}</span>
      </Link>

      {/*
        Non-library state hint. Rendered ABOVE the hero so the user
        sees the "Add to collection" CTA before any Collection-only
        action they'd try to use in the action bar. Hidden for
        synthetic `egs_*` VNs that already surface a dedicated EGS-
        only state through `<MatchBadges>` below.
      */}
      {!inCol && !vn.id.startsWith('egs_') && (
        <NotInCollectionBanner vnId={vn.id} />
      )}

      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
        <HeroBanner
          vnId={vn.id}
          src={bannerSrc}
          customBanner={customBanner}
          initialPosition={vn.banner_position}
          initialRotation={vn.banner_rotation}
          inCollection={inCol}
          sexual={vn.image_sexual}
        />

        <div className="relative -mt-44 grid grid-cols-1 gap-4 px-3 pb-4 sm:gap-6 sm:px-6 sm:pb-6 md:grid-cols-[260px_1fr] md:gap-8 md:px-8 md:pb-8">
          <div className="z-10 mx-auto w-full max-w-[260px] md:mx-0">
            <div className="group relative">
              {inCol && (egsPosterHas || customPosterHas) ? (
                <CoverCompare
                  vnId={vn.id}
                  current={sourcePref.image ?? 'auto'}
                  vndb={vndbPoster}
                  egs={egsPoster}
                  custom={customPoster}
                  sexual={vn.image_sexual ?? null}
                  alt={vn.title}
                  initialRotation={vn.cover_rotation}
                />
              ) : (
                <div className="relative">
                  {/*
                    CoverHero is a client wrapper around SafeImage that
                    listens for vn:cover-changed events so the rendered
                    cover repaints when a sibling surface (the media
                    gallery kebab, the source picker) mutates it. It
                    also hosts the per-cover rotation controls.
                  */}
                  <CoverHero
                    vnId={vn.id}
                    initialRemote={heroPoster.remote}
                    initialLocal={heroPoster.local}
                    sexual={vn.image_sexual ?? null}
                    alt={displayTitle}
                    initialRotation={vn.cover_rotation}
                    inCollection={inCol}
                  />
                  {inCol && !heroPoster.remote && !heroPoster.local && (
                    <div className="absolute inset-x-2 bottom-2 z-10 flex justify-center">
                      <CoverUploader vnId={vn.id} hasCustom={!!vn.custom_cover} variant="inline" />
                    </div>
                  )}
                </div>
              )}
              {/*
                CoverEditOverlay is still rendered alongside CoverCompare
                (for the comparison branch); CoverHero already includes
                it for the simple branch so we only mount it when the
                comparison view owns the image.
              */}
              {inCol && (egsPosterHas || customPosterHas) && <CoverEditOverlay vnId={vn.id} />}
              {/*
                Standalone rotation overlay. Mounts for every in-
                collection VN, regardless of which display branch
                (`<CoverHero>` simple vs `<CoverCompare>` compare)
                rendered the actual cover. This fixes the regression
                where rotating the cover was only possible on the
                simple-branch path; users with a custom or EGS cover
                had no rotation surface at all on the actual cover.
              */}
              {inCol && (
                <CoverRotationButtons
                  vnId={vn.id}
                  initialRotation={vn.cover_rotation}
                  anchor="top-right"
                />
              )}
            </div>
          </div>

          <div className="z-10 flex min-w-0 flex-col gap-3 pt-6 md:pt-44">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <MatchBadges egsOnly={vn.id.startsWith('egs_')} egs={egsRow} t={t} />
                {isFanDisc && (
                  <span className="mb-2 inline-flex items-center gap-1 rounded-md border border-accent-blue/40 bg-accent-blue/15 px-2 py-1 text-xs font-bold text-accent-blue" title={t.library.fanDiscHint}>
                    <Disc3 className="h-3.5 w-3.5" aria-hidden />
                    {t.library.fanDisc}
                  </span>
                )}
                <TitleLine title={displayTitle} alttitle={displayAltTitle} />
                {(vn.titles ?? []).length > 1 && (
                  <details className="group mt-1 text-[11px]">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-white [&::-webkit-details-marker]:hidden [list-style:none]">
                      <ChevronRight
                        className="h-3 w-3 transition-transform duration-150 group-open:rotate-90"
                        aria-hidden
                      />
                      <span className="font-bold uppercase tracking-wider">{t.detail.titlesAll}</span>
                      <span className="ml-1 opacity-70">({(vn.titles ?? []).length})</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {(vn.titles ?? []).map((tr) => (
                        <li key={`${tr.lang}-${tr.title}`} className="text-white/85">
                          <span className="mr-1 inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded bg-bg-elev/60 px-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                            {tr.lang}
                          </span>
                          {tr.title}
                          {tr.latin && tr.latin !== tr.title && (
                            <span className="ml-1 text-muted">({tr.latin})</span>
                          )}
                          {!tr.official && <span className="ml-1 text-[10px] text-muted">· {t.titles.unofficial}</span>}
                          {tr.main && (
                            <Star
                              className="ml-1 inline h-2.5 w-2.5 fill-accent text-accent"
                              aria-label={t.titles.main}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {(vn.aliases ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <span className="font-bold uppercase tracking-wider">
                      {t.detail.aliases}
                    </span>
                    {(vn.aliases ?? []).slice(0, 6).map((a) => (
                      <span key={a} className="max-w-[16rem] truncate opacity-90" title={a}>
                        {a}
                      </span>
                    ))}
                    {(vn.aliases ?? []).length > 6 && (
                      <span className="text-muted/60">{t.form.andNMore.replace('{n}', String((vn.aliases ?? []).length - 6))}</span>
                    )}
                  </div>
                )}
                <VnListMemberships
                  vnId={vn.id}
                  lists={listsForThisVn.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
                />
              </div>
              {status && <StatusBadge status={status} />}
            </div>

            <ScoreSection
              unifiedRating={unifiedRating}
              unifiedRatingSource={unifiedRatingSource}
              vndbRating={vndbRating}
              egsRating={egsRating}
              vndbAverage={vn.average ?? null}
              userRating={vn.user_rating ?? null}
              votecount={vn.votecount ?? 0}
              formattedVotecount={fmtNum(vn.votecount ?? 0, locale)}
              ratingOf10={t.detail.ratingOf10}
              votes={t.detail.votes}
            />

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:gap-x-6 sm:grid-cols-3">
              {vn.released && (
                <div>
                  <dt className="label">{t.detail.released}</dt>
                  <dd className="font-semibold">
                    {/*
                      Wrap the release date in a Link that pre-fills
                      the Library year filter. The 4-digit prefix
                      (which VNDB returns even for partial dates like
                      "2024-09") is the canonical bucket key the
                      `?yearMin=/yearMax=` chips on /stats already
                      use, so the action stays consistent across
                      surfaces. The raw date keeps full precision in
                      the visible text.
                    */}
                    {(() => {
                      const year = vn.released.slice(0, 4);
                      if (/^\d{4}$/.test(year)) {
                        return (
                          <Link
                            href={`/?yearMin=${year}&yearMax=${year}`}
                            className="transition-colors hover:text-accent"
                          >
                            {formatVndbDateString(vn.released, locale)}
                          </Link>
                        );
                      }
                      return formatVndbDateString(vn.released, locale);
                    })()}
                  </dd>
                </div>
              )}
              {vn.devstatus != null && vn.devstatus !== 0 && (
                <div>
                  <dt className="label">{t.detail.devstatus}</dt>
                  <dd className="font-semibold">
                    {vn.devstatus === 1 ? t.detail.devstatusInDev : t.detail.devstatusCancelled}
                  </dd>
                </div>
              )}
              {vn.olang && (
                <div>
                  <dt className="label">{t.detail.olang}</dt>
                  <dd className="font-semibold">{vn.olang.toUpperCase()}</dd>
                </div>
              )}
              <div className="col-span-2 sm:col-span-3">
                <dt className="label">{t.detail.lengthVndb}</dt>
                <dd className="font-semibold">
                  {inCol ? (
                    <PlaytimeCompare
                      vnId={vn.id}
                      current={sourcePref.playtime ?? 'auto'}
                      vndb={vn.length_minutes ?? null}
                      egs={egsRow?.playtime_median_minutes ?? null}
                      mine={vn.playtime_minutes ?? null}
                    />
                  ) : (
                    <>
                      {fmtMinutes(vn.length_minutes, locale, t)}
                      {vn.length_votes != null && vn.length_votes > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted">
                          · {vn.length_votes} {t.detail.lengthVotes}
                        </span>
                      )}
                    </>
                  )}
                </dd>
                {inCol && (
                  <ReadingSpeedBadge
                    vndbLength={vn.length_minutes ?? null}
                    egsLength={egsRow?.playtime_median_minutes ?? null}
                  />
                )}
              </div>
              {!!vn.languages?.length && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.languages}</dt>
                  <dd className="font-semibold">
                    <LangList langs={vn.languages.slice(0, 12)} />
                  </dd>
                </div>
              )}
              {!!vn.platforms?.length && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.platforms}</dt>
                  {/*
                    Each platform code links to `/search?platforms=<code>`.
                    Previously the row was a dead comma-joined string —
                    the acceptance gate flagged that metadata had to be
                    actionable everywhere it appears. Same chip styling
                    as `<LangList>` for visual consistency.
                  */}
                  <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                    {vn.platforms.slice(0, 10).map((p) => (
                      <Link
                        key={p}
                        href={`/search?platforms=${encodeURIComponent(p)}`}
                        title={p}
                        aria-label={p}
                        className="inline-flex items-center rounded border border-border bg-bg-elev/40 px-1.5 py-0.5 text-xs tracking-wide text-muted transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
                      >
                        {platformLabel(p)}
                      </Link>
                    ))}
                    {vn.platforms.length > 10 && (
                      <span className="text-xs text-muted/60">
                        {t.form.andNMore.replace('{n}', String(vn.platforms.length - 10))}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {(() => {
                const aspectDisplay = isVndbVnId(vn.id)
                  ? deriveVnAspectDisplay(vn.id)
                  : { aspect: 'unknown' as const, aspects: [], width: null, height: null, source: 'unknown' as const };
                const isUnknown = aspectDisplay.aspect === 'unknown';
                const sourceLabel =
                  aspectDisplay.source === 'manual' ? t.detail.aspectSourceManual
                  : aspectDisplay.source === 'edition' ? t.detail.aspectSourceEdition
                  : aspectDisplay.source === 'release' ? t.detail.aspectSourceRelease
                  : aspectDisplay.source === 'screenshot' ? t.detail.aspectSourceScreenshot
                  : null;
                const allAspects = aspectDisplay.aspects.length > 0
                  ? aspectDisplay.aspects
                      .map((k) => t.aspect.keys[k as keyof typeof t.aspect.keys] ?? k)
                      .join(' · ')
                  : t.aspect.keys.unknown;
                return (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="label">{t.detail.aspectLabel}</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <a
                        href="#section-aspect-override"
                        className={`inline-flex items-center gap-1 rounded font-semibold underline decoration-dotted underline-offset-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isUnknown ? 'text-muted' : 'text-white'}`}
                        title={t.detail.aspectScrollHint}
                        aria-label={t.detail.aspectScrollHint}
                      >
                        <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden />
                        {allAspects}
                      </a>
                      {aspectDisplay.width != null && aspectDisplay.height != null && (
                        <span className="text-xs font-mono text-muted">
                          · {aspectDisplay.width}×{aspectDisplay.height}
                        </span>
                      )}
                      {/*
                        Secondary chip — links to the Library
                        pre-filtered by this aspect key. The
                        primary anchor (above) jumps to the
                        override editor on the same page; this
                        complementary chip lets the reader
                        pivot outward to "every VN at this
                        ratio" without scrolling first.
                      */}
                      {!isUnknown && (
                        <Link
                          href={`/?aspect=${encodeURIComponent(aspectDisplay.aspect)}`}
                          className="rounded-md border border-border bg-bg-elev/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-accent hover:text-accent"
                          title={t.detail.aspectFilterLibrary}
                        >
                          {t.detail.aspectFilterLibraryShort}
                        </Link>
                      )}
                      {sourceLabel && (
                        <span className="rounded-md border border-border bg-bg-elev/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                          {sourceLabel}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })()}
              {(vn.developers?.length || egsRow?.brand_name) && (
                <div className="col-span-2 sm:col-span-3">
                  <BrandCompare
                    vnId={vn.id}
                    current={sourcePref.brand ?? 'auto'}
                    vndbDevs={(vn.developers ?? []).map((d) => ({ id: d.id ?? '', name: d.name }))}
                    egsBrand={egsRow?.brand_name ?? null}
                    label={t.detail.developers}
                  />
                </div>
              )}
              {(vn.publishers?.length ?? 0) > 0 && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="label">{t.detail.publishers}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {(vn.publishers ?? []).map((p) =>
                      p.id ? (
                        <Link
                          key={p.id}
                          href={`/producer/${p.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-xs font-semibold text-white/85 hover:border-accent hover:text-accent"
                        >
                          <Package className="h-3 w-3 text-accent-blue" aria-hidden />
                          {p.name}
                        </Link>
                      ) : (
                        <span
                          key={p.name}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-xs font-semibold text-muted"
                        >
                          <Package className="h-3 w-3 text-accent-blue" aria-hidden />
                          {p.name}
                        </span>
                      ),
                    )}
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
                {/*
                  Dumped chip — links to `/?dumped=1` so the user can
                  jump back to every VN flagged dumped from the detail
                  view. Renders only when the dumped flag is set; the
                  inverse state is conveyed by the chip's absence
                  rather than a "not dumped" pill, matching the
                  established pattern for binary tracking flags
                  (favorite, started, finished).
                */}
                {vn.dumped && (
                  <Link
                    href="/?dumped=1"
                    className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent transition-colors hover:border-accent hover:bg-accent/20"
                    title={t.form.dumpedHint}
                  >
                    <HardDriveDownload className="h-3 w-3" aria-hidden /> {t.form.dumped}
                  </Link>
                )}
              </div>
            )}

            {/* VnTagsGroupedView replaces the flat top-16 chip
                strip with category sections (Content / Sexual /
                Technical), a rating badge per chip, and a
                Summary-vs-All + spoiler-mode toggle. The original
                <VnTagChips> stays available as the compact card
                fallback (see SearchClient.tsx / VnCard.tsx). */}
            <VnTagsGroupedView tags={vn.tags ?? []} spoilOverride={spoilOverride} />

            {/*
              The detail-page action bar used to be a flat `flex-wrap`
              row mixing tracking, sync, media, and destructive
              affordances. The regrouped <VnDetailActionsBar>
              renders the SAME set of buttons split into 6 labeled
              clusters with a thin vertical separator between each,
              so the cognitive load of scanning the row drops
              dramatically on dense VN pages. Each cluster carries an
              aria-label for screen readers; the visual labels
              themselves stay implicit to avoid doubling the row
              height.
            */}
            <VnDetailActionsBar vn={vn} inCollection={inCol} egsRow={egsRow} egsHasImage={egsPosterHas} hasCustomBanner={customBanner} />
            {inCol && (
              <SmartStatusHint
                vnId={vn.id}
                status={status}
                playtimeMinutes={vn.playtime_minutes}
                vndbLengthMinutes={vn.length_minutes}
              />
            )}
          </div>
        </div>

        {(vn.description || egsRow || (inCol && vn.custom_description)) && (
          <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
            {inCol ? (
              <CustomSynopsis
                vnId={vn.id}
                label={t.detail.synopsis}
                initial={vn.custom_description ?? null}
                fallback={
                  <FieldCompare
                    vnId={vn.id}
                    field="description"
                    current={sourcePref.description ?? 'auto'}
                    vndb={vn.description ?? null}
                    egs={egsRow?.description ?? null}
                    label={t.detail.synopsis}
                    egsLinked={!!egsRow}
                  />
                }
              />
            ) : (
              <FieldCompare
                vnId={vn.id}
                field="description"
                current={sourcePref.description ?? 'auto'}
                vndb={vn.description ?? null}
                egs={egsRow?.description ?? null}
                label={t.detail.synopsis}
                egsLinked={!!egsRow}
              />
            )}
          </div>
        )}

        {(vn.screenshots.length > 0 || vn.release_images.length > 0) && (
          <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.media.section}</h2>
            <MediaGallery vnId={vn.id} screenshots={vn.screenshots} releaseImages={vn.release_images} />
          </div>
        )}
      </div>

      {/*
        Customizable sections — order, visibility, and "collapsed by
        default" are user-controlled via `<VnDetailLayout>`. The main
        identity card above is intentionally fixed; only the blocks
        below participate in the layout system.

        Each entry's `node` is built lazily-here so a hidden section
        still never mounts (the layout host filters by visible before
        rendering). For `inCol`-only sections we omit them entirely
        when the VN isn't in the collection — those ids simply don't
        appear in the host's `sections` map and are skipped.
      */}
      {(() => {
        // Read the layout once so the host renders sections in the
        // user's saved order / visibility. Collapse state is owned by
        // each section's `DetailSectionFrame` (seeded from
        // `collapsedByDefault`, persisted per section in localStorage).
        const layout = parseVnDetailLayoutV1(getAppSetting('vn_detail_section_layout_v1'));
        const sectionNodes: Partial<Record<VnSectionId, React.ReactNode>> = {};
        if (inCol) {
          sectionNodes['notes'] = <NotesSectionToggle notes={vn.notes} emptyLabel={t.form.notesEmpty} />;
        }
        if (inCol) {
          // Only mount the suggestion section when the detector has
          // something to offer — otherwise the section frame would
          // render an empty collapsible card for a card that used to
          // vanish entirely.
          const seriesSuggestion = detectSeriesForVn(vn.id);
          if (seriesSuggestion && (seriesSuggestion.existing.length > 0 || seriesSuggestion.suggestedName)) {
            sectionNodes['series-suggest'] = <SeriesAutoSuggest vnId={vn.id} suggestion={seriesSuggestion} />;
          }
          sectionNodes['routes'] = <RoutesSection vnId={vn.id} inCollection={inCol} />;
          sectionNodes['session-activity'] = (
            <div className="space-y-4 p-4 sm:p-6">
              <SessionPanel
                vnId={vn.id}
                currentMinutes={vn.playtime_minutes ?? 0}
                initialLog={listGameLogForVn(vn.id, 200)}
              />
              <ActivityTimeline vnId={vn.id} initial={listActivityForVn(vn.id, 50)} />
            </div>
          );
        }
        if (vn.relations && vn.relations.length > 0) {
          // Single IN(...) lookup beats one isInCollection() SELECT
          // per relation. With ~30 relations this used to be 30
          // round-trips per VN page render.
          const ownedSet = isInCollectionMany(vn.relations.map((r) => r.id));
          sectionNodes['relations'] = (
            <RelationsSection
              relations={vn.relations.map((r) => ({ ...r, in_collection: ownedSet.has(r.id) }))}
            />
          );
        }
        if (!vn.id.startsWith('egs_')) {
          sectionNodes['vndb-status'] = <VndbStatusPanel vnId={vn.id} />;
        }
        const stockSnapshot = getStockForVn(vn.id);
        sectionNodes['stock'] = (
          <StockPanelBoundary
            title={t.stock.title}
            fallbackMessage={t.stock.boundaryFallback as string}
            retryLabel={t.stock.boundaryRetry as string}
          >
            <StockPanel
              vnId={vn.id}
              title={displayTitle}
              altTitle={vn.alttitle ?? null}
              vndbAliases={(vn.aliases ?? []) as string[]}
              initialSnapshot={stockSnapshot}
              showErogePrice={false}
              placeMap={getPlaceProviderMap()}
              bare
            />
          </StockPanelBoundary>
        );
        // StockPricesSection hides itself unless the eroge_price
        // provider returned a v1 extras blob; gate on that so a VN
        // without price history doesn't get an empty section frame.
        const hasErogePriceExtras = stockSnapshot.statuses.some((s) => {
          return s.provider === 'eroge_price' && decodeStoredExtras(s.extras_json) !== null;
        });
        if (hasErogePriceExtras) {
          sectionNodes['stock-prices'] = <StockPricesSection vnId={vn.id} initialSnapshot={stockSnapshot} />;
        }
        sectionNodes['egs-panel'] = (
          <EgsPanel
            vnId={vn.id}
            vndbRating={vn.rating ?? null}
            vndbVoteCount={vn.votecount ?? null}
            vndbLengthMinutes={vn.length_minutes ?? null}
            myPlaytimeMinutes={vn.playtime_minutes ?? 0}
            searchSeed={vn.alttitle?.trim() || vn.title}
            initialGame={
              egsRow?.egs_id
                ? {
                    id: egsRow.egs_id,
                    gamename: egsRow.gamename ?? '',
                    median: egsRow.median,
                    average: egsRow.average,
                    dispersion: egsRow.dispersion,
                    count: egsRow.count,
                    sellday: egsRow.sellday,
                    playtime_median_minutes: egsRow.playtime_median_minutes,
                    url: `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsRow.egs_id}`,
                  }
                : null
            }
            initialSource={egsRow?.source ?? null}
          />
        );
        // EgsRichDetails hides itself when the VN has no EGS match;
        // gate on the linked EGS row so a non-linked VN doesn't get an
        // empty section frame.
        if (egsRow) {
          sectionNodes['egs-details'] = <EgsRichDetails vnId={vn.id} />;
        }
        sectionNodes['characters'] = <CharactersSection vnId={vn.id} spoilOverride={spoilOverride} />;
        if ((vn.va ?? []).length > 0) {
          sectionNodes['cast'] = <CastSection va={vn.va ?? []} />;
        }
        if ((vn.staff ?? []).length > 0) {
          sectionNodes['staff'] = <StaffSection staff={vn.staff ?? []} />;
        }
        {
          const initialOverride = isVndbVnId(vn.id) ? getVnAspectOverride(vn.id) : null;
          const initialDerived = deriveVnAspectKey(vn.id);
          sectionNodes['aspect-override'] = (
            <AspectOverrideControl
              vnId={vn.id}
              initialDerived={initialDerived}
              initialOverride={initialOverride ? { aspect_key: initialOverride.aspect_key, note: initialOverride.note } : null}
            />
          );
        }
        if (inCol) {
          // The tag-overlap panel only renders with co-occurrence
          // signal (2+ shared-tag rows); computing it here lets the
          // host skip the section entirely below that threshold so the
          // frame is never empty.
          const cooccurringTags = getCoOccurringTags(vn.id, 18);
          if (cooccurringTags.length >= 2) {
            sectionNodes['tag-overlap'] = <TagCoOccurrence rows={cooccurringTags} />;
          }
          sectionNodes['similar'] = (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <p className="text-xs text-muted/80">{t.similar.sectionHint}</p>
              <Link
                href={`/similar?vn=${vn.id}`}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-3 py-1.5 text-xs font-bold text-muted hover:border-accent hover:text-accent"
              >
                <Sparkles className="h-3 w-3" aria-hidden /> {t.similar.moreLink}
              </Link>
            </div>
          );
          sectionNodes['my-editions'] = (
            <OwnedEditionsSection
              vnId={vn.id}
              parentVnTitle={vn.title}
              parentVnCover={{
                url: vn.image_url ?? null,
                localPath: vn.local_image || vn.local_image_thumb,
                sexual: vn.image_sexual ?? null,
              }}
            />
          );
        }
        sectionNodes['releases'] = <ReleasesSection vnId={vn.id} inCollection={inCol} />;
        sectionNodes['quotes'] = <QuotesSection vnId={vn.id} />;
        sectionNodes['edit-form'] = <EditForm vn={vn} inCollection={inCol} allSeries={allSeries} />;
        return (
          <VnDetailLayout
            vnId={vn.id}
            initialLayout={layout}
            sectionNodes={sectionNodes}
          />
        );
      })()}
    </div>
  );
}
