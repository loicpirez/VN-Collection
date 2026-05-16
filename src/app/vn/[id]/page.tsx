import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Box, ChevronRight, Download, ExternalLink, Globe, Home, MapPin, Package, Sparkles, Star } from 'lucide-react';
import {
  deriveVnAspectDisplay,
  deriveVnAspectKey,
  getAppSetting,
  getCollectionItem,
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
  upsertVn,
} from '@/lib/db';
import { parseVnDetailLayoutV1 } from '@/lib/vn-detail-layout';
import { VnDetailLayout, type VnDetailSection } from '@/components/VnDetailLayout';
import { AspectOverrideControl } from '@/components/AspectOverrideControl';
import { getVn } from '@/lib/vndb';
import { resolveField } from '@/lib/source-resolve';
import { formatMinutes } from '@/lib/format';
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
import { CastSection } from '@/components/CastSection';
import { StaffSection } from '@/components/StaffSection';
import { TagCoOccurrence } from '@/components/TagCoOccurrence';
import { ReadingSpeedBadge } from '@/components/ReadingSpeedBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { SeriesAutoSuggest } from '@/components/SeriesAutoSuggest';
import { detectSeriesForVn } from '@/lib/series-detect';
import { QueueButton } from '@/components/QueueButton';
import { SessionPanel } from '@/components/SessionPanel';
import { FavoriteToggleButton } from '@/components/FavoriteToggleButton';
import { ListsPickerButton } from '@/components/ListsPickerButton';
import { CoverSourcePicker } from '@/components/CoverSourcePicker';
import { CoverEditOverlay } from '@/components/CoverEditOverlay';
import { BannerSourcePicker } from '@/components/BannerSourcePicker';
import { VnListMemberships } from '@/components/VnListMemberships';
import { PlaytimeCompare } from '@/components/PlaytimeCompare';
import { SmartStatusHint } from '@/components/SmartStatusHint';
import { AnimeChip } from '@/components/AnimeChip';
import { CoverQuickActions } from '@/components/CoverQuickActions';
import { ReleasesSection } from '@/components/ReleasesSection';
import { OwnedEditionsSection } from '@/components/OwnedEditionsSection';
import { QuotesSection } from '@/components/QuotesSection';
import { RoutesSection } from '@/components/RoutesSection';
import { LangList } from '@/components/LangFlag';
import { RelationsSection } from '@/components/RelationsSection';
import { RecordRecentView } from '@/components/RecordRecentView';
import { TitleLine } from '@/components/TitleLine';
import { EgsPanel } from '@/components/EgsPanel';
import { LinkToVndbButton } from '@/components/LinkToVndbButton';
import { CompareWithButton } from '@/components/CompareWithButton';
import { EgsRichDetails } from '@/components/EgsRichDetails';
import { MatchBadges } from '@/components/MatchBadges';
import { VndbStatusPanel } from '@/components/VndbStatusPanel';
import { SourceTag } from '@/components/SourceTag';
import { SourceSwitcher } from '@/components/SourceSwitcher';
import { FieldCompare } from '@/components/FieldCompare';
import { CustomSynopsis } from '@/components/CustomSynopsis';
import { BrandCompare } from '@/components/BrandCompare';
import { CoverCompare } from '@/components/CoverCompare';
import { VnTagChips } from '@/components/VnTagChips';
import type { BoxType, CollectionItem, EditionType, Location, Status } from '@/lib/types';

export const dynamic = 'force-dynamic';
const CACHE_MS = 24 * 3600 * 1000;

function fmtMinutes(m: number | null | undefined): string {
  return formatMinutes(m, { fallback: '—', emptyValue: 'strict_positive' });
}

async function loadVn(id: string): Promise<{ vn: CollectionItem | null; error: string | null }> {
  const cached = getCollectionItem(id);
  // EGS-only synthetic VNs aren't on VNDB — always serve from cache.
  if (isEgsOnly(id)) {
    return { vn: cached, error: null };
  }
  if (cached && Date.now() - cached.fetched_at < CACHE_MS) return { vn: cached, error: null };
  try {
    const fresh = await getVn(id);
    if (!fresh) {
      if (cached) return { vn: cached, error: null };
      return { vn: null, error: `VNDB returned no result for ${id}` };
    }
    upsertVn(fresh);
    return { vn: getCollectionItem(id), error: null };
  } catch (e) {
    const msg = (e as Error).message || '';
    if (cached) return { vn: cached, error: null };
    return { vn: null, error: msg };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId).replace(/^egs:/, 'egs_');
  const local = getCollectionItem(id);
  const title = local?.title ?? id;
  return { title };
}

export default async function VnDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  // Next gives us URL-encoded dynamic params (e.g. `egs%3A894`); decode once
  // so the rest of the page doesn't care. Legacy `egs:NNNN` form is still
  // accepted here — the startup migration converts them to `egs_NNNN`.
  const id = decodeURIComponent(rawId).replace(/^egs:/, 'egs_');
  if (!/^(v\d+|egs_\d+)$/i.test(id)) notFound();
  const t = await getDict();
  const { vn, error } = await loadVn(id);
  if (!vn) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> {t.nav.library}
        </Link>
        <div className="rounded-2xl border border-status-dropped/40 bg-status-dropped/5 p-6">
          <h1 className="mb-2 text-xl font-bold text-status-dropped">{t.detail.notFoundTitle}</h1>
          <p className="text-sm text-muted">{t.detail.notFoundBody.replace('{id}', id)}</p>
          {error && (
            <pre className="mt-3 overflow-x-auto rounded bg-bg-elev/60 p-2 text-[11px] text-status-dropped/80">{error}</pre>
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
  const allSeries = listSeries();
  const listsForThisVn = listListsForVn(id);
  // Aspect ratio: materialize from cached VNDB release payloads ONCE,
  // here, before any aspect-aware component renders. Both the
  // identity metadata row AND the AspectOverrideControl below read
  // the same derived state — they MUST agree.
  if (/^v\d+$/.test(vn.id)) {
    materializeReleaseAspectsForVn(vn.id);
  }
  const status = (vn.status as Status | undefined) ?? null;
  const ratingNum = vn.rating != null ? (vn.rating / 10).toFixed(1) : '—';
  // Per-field source preference (VNDB / EGS / Custom) — pulled per-VN, defaults to Auto.
  const egsRow = getEgsForVn(vn.id);
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
      <RecordRecentView
        id={vn.id}
        title={vn.title}
        poster={vn.image_url || vn.image_thumb}
        localPoster={vn.local_image || vn.local_image_thumb}
        sexual={vn.image_sexual}
      />
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
                />
              ) : (
                <div className="relative">
                  <SafeImage
                    src={heroPoster.remote}
                    localSrc={heroPoster.local}
                    alt={vn.title}
                    sexual={vn.image_sexual ?? null}
                    className="aspect-[2/3] w-full rounded-xl shadow-card"
                  />
                  {inCol && !heroPoster.remote && !heroPoster.local && (
                    <div className="absolute inset-x-2 bottom-2 z-10 flex justify-center">
                      <CoverUploader vnId={vn.id} hasCustom={!!vn.custom_cover} variant="inline" />
                    </div>
                  )}
                </div>
              )}
              {inCol && <CoverEditOverlay vnId={vn.id} />}
            </div>
          </div>

          <div className="z-10 flex flex-col gap-3 pt-6 md:pt-44">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <MatchBadges egsOnly={vn.id.startsWith('egs_')} egs={egsRow} t={t} />
                <TitleLine title={vn.title} alttitle={vn.alttitle} />
                {(vn.titles ?? []).length > 1 && (
                  <details className="mt-1 text-[11px]">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-white [&::-webkit-details-marker]:hidden [list-style:none]">
                      <ChevronRight className="h-3 w-3 transition-transform" aria-hidden />
                      <span className="font-bold uppercase tracking-wider">{t.detail.titlesAll}</span>
                      <span className="ml-1 opacity-70">({(vn.titles ?? []).length})</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {(vn.titles ?? []).map((tr) => (
                        <li key={`${tr.lang}-${tr.title}`} className="text-white/85">
                          <span className="mr-1 inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded bg-bg-elev/60 px-1 text-[9px] font-bold uppercase tracking-wider text-muted">
                            {tr.lang}
                          </span>
                          {tr.title}
                          {tr.latin && tr.latin !== tr.title && (
                            <span className="ml-1 text-muted">({tr.latin})</span>
                          )}
                          {!tr.official && <span className="ml-1 text-[9px] text-muted">· {t.titles.unofficial}</span>}
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
                      <span key={a} className="opacity-90">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                <VnListMemberships
                  vnId={vn.id}
                  lists={listsForThisVn.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
                />
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

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:gap-x-6 sm:grid-cols-3">
              {vn.released && (
                <div>
                  <dt className="label">{t.detail.released}</dt>
                  <dd className="font-semibold">{vn.released}</dd>
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
                      {fmtMinutes(vn.length_minutes)}
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
              {vn.average != null && vn.rating != null && vn.average !== vn.rating && (
                <div>
                  <dt className="label">{t.detail.averageVndb}</dt>
                  <dd className="font-semibold">{(vn.average / 10).toFixed(2)}</dd>
                </div>
              )}
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
                  <dd className="font-semibold">{vn.platforms.slice(0, 10).join(', ')}</dd>
                </div>
              )}
              {/*
                Aspect ratio / resolution in the main identity metadata
                — uses the same `deriveVnAspectDisplay` source of truth
                as the Library filter and the AspectOverrideControl
                lower on the page. The materializer call earlier in
                this render ensured release_resolution_cache has
                already been populated from cached VNDB release
                payloads, so we don't flash an "unknown" state for
                VNs whose only signal is in the cached `POST /release`
                response body.
              */}
              {(() => {
                const aspectDisplay = /^v\d+$/.test(vn.id)
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
                  ? aspectDisplay.aspects.join(' · ')
                  : t.aspect.keys.unknown;
                return (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="label">{t.detail.aspectLabel}</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <a
                        href="#section-aspect-override"
                        className={`font-semibold transition-colors hover:text-accent ${isUnknown ? 'text-muted' : 'text-white'}`}
                        title={t.detail.aspectScrollHint}
                      >
                        {allAspects}
                      </a>
                      {aspectDisplay.width != null && aspectDisplay.height != null && (
                        <span className="text-xs font-mono text-muted">
                          · {aspectDisplay.width}×{aspectDisplay.height}
                        </span>
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
              </div>
            )}

            <VnTagChips tags={vn.tags ?? []} max={16} />

            <div className="mt-3 flex flex-wrap gap-2">
              {!vn.id.startsWith('egs_') && (
                <a href={`https://vndb.org/${vn.id}`} target="_blank" rel="noopener noreferrer" className="btn">
                  <ExternalLink className="h-4 w-4" /> {t.detail.viewOnVndb}
                </a>
              )}
              {egsRow?.egs_id && (
                <a
                  href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsRow.egs_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  <ExternalLink className="h-4 w-4" /> {t.detail.viewOnEgs}
                </a>
              )}
              {vn.id.startsWith('egs_') && (
                <LinkToVndbButton vnId={vn.id} seedQuery={vn.alttitle?.trim() || vn.title} />
              )}
              <CompareWithButton currentVnId={vn.id} />
              {(vn.extlinks ?? []).slice(0, 8).map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                  title={l.label}
                >
                  <ExternalLink className="h-3 w-3" /> {l.label}
                </a>
              ))}
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
              <CoverQuickActions vnId={vn.id} inCollection={inCol} />
              {inCol && (
                <CoverSourcePicker
                  vnId={vn.id}
                  vndbImage={vn.image_url}
                  egsId={egsRow?.egs_id ?? null}
                  currentCustomCover={vn.custom_cover ?? null}
                  screenshots={vn.screenshots ?? []}
                  releaseImages={vn.release_images ?? []}
                />
              )}
              {inCol && (
                <BannerSourcePicker
                  vnId={vn.id}
                  currentBanner={vn.banner_image ?? null}
                  coverRemote={vn.image_url}
                  coverLocal={vn.local_image || vn.local_image_thumb}
                  coverSexual={vn.image_sexual ?? null}
                  screenshots={vn.screenshots ?? []}
                  releaseImages={vn.release_images ?? []}
                />
              )}
              {inCol && <DownloadAssetsButton vnId={vn.id} />}
              {inCol && <QueueButton vnId={vn.id} />}
              {inCol && (
                <FavoriteToggleButton
                  vnId={vn.id}
                  initial={!!vn.favorite}
                  inCollection
                  variant="inline"
                />
              )}
              <ListsPickerButton vnId={vn.id} variant="inline" />
              {inCol && <AnimeChip vnId={vn.id} />}
            </div>
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
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.media.section}</h3>
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
        // Read the layout once so we can both pass the canonical
        // config to the host AND thread `collapsedByDefault` into the
        // three sections that own their own `<details>` chevron. Without
        // this, unticking "collapsed by default" had no effect on
        // Characters / Releases / Quotes — they hard-coded
        // useState(false).
        const layout = parseVnDetailLayoutV1(getAppSetting('vn_detail_section_layout_v1'));
        const sectionOpens = (id: keyof typeof layout.sections): boolean =>
          !layout.sections[id].collapsedByDefault;
        const sections: VnDetailSection[] = [];
        if (inCol && vn.notes) {
          sections.push({
            id: 'notes',
            node: (
              <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.form.personalNotes}</h3>
                <MarkdownView source={vn.notes} />
              </div>
            ),
          });
        }
        if (inCol) {
          sections.push({
            id: 'series-suggest',
            node: <SeriesAutoSuggest vnId={vn.id} suggestion={detectSeriesForVn(vn.id)} />,
          });
          sections.push({
            id: 'routes',
            node: <RoutesSection vnId={vn.id} inCollection={inCol} />,
          });
          sections.push({
            id: 'session-activity',
            node: (
              <div className="space-y-4">
                <SessionPanel
                  vnId={vn.id}
                  currentMinutes={vn.playtime_minutes ?? 0}
                  initialLog={listGameLogForVn(vn.id, 200)}
                />
                <ActivityTimeline vnId={vn.id} initial={listActivityForVn(vn.id, 50)} />
              </div>
            ),
          });
        }
        if (vn.relations && vn.relations.length > 0) {
          // Single IN(...) lookup beats one isInCollection() SELECT
          // per relation. With ~30 relations this used to be 30
          // round-trips per VN page render.
          const ownedSet = isInCollectionMany(vn.relations.map((r) => r.id));
          sections.push({
            id: 'relations',
            node: (
              <RelationsSection
                relations={vn.relations.map((r) => ({ ...r, in_collection: ownedSet.has(r.id) }))}
              />
            ),
          });
        }
        if (!vn.id.startsWith('egs_')) {
          sections.push({
            id: 'vndb-status',
            node: <VndbStatusPanel vnId={vn.id} />,
          });
        }
        sections.push({
          id: 'egs-panel',
          node: (
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
          ),
        });
        sections.push({ id: 'egs-details', node: <EgsRichDetails vnId={vn.id} /> });
        sections.push({
          id: 'characters',
          node: <CharactersSection vnId={vn.id} initialOpen={sectionOpens('characters')} />,
        });
        if ((vn.va ?? []).length > 0) {
          sections.push({ id: 'cast', node: <CastSection va={vn.va ?? []} /> });
        }
        if ((vn.staff ?? []).length > 0) {
          sections.push({ id: 'staff', node: <StaffSection staff={vn.staff ?? []} /> });
        }
        // Aspect-ratio control is meaningful for any VN (in collection
        // or not) — surfaces the derived ratio and lets the user pin
        // a manual override that beats everything else.
        {
          // SSR-pre-derive so the AspectOverrideControl paints
          // the right value on first frame instead of flashing
          // "Auto · unknown" while the client fetch is in flight.
          // Also materialize from any cached VNDB release payload
          // Materialization already ran near the top of this
          // render (see materializeReleaseAspectsForVn invocation
          // above the identity metadata block). Both surfaces use
          // the same derived data.
          const initialOverride = /^v\d+$/.test(vn.id) ? getVnAspectOverride(vn.id) : null;
          const initialDerived = deriveVnAspectKey(vn.id);
          sections.push({
            id: 'aspect-override',
            node: (
              <AspectOverrideControl
                vnId={vn.id}
                initialDerived={initialDerived}
                initialOverride={
                  initialOverride
                    ? { aspect_key: initialOverride.aspect_key, note: initialOverride.note }
                    : null
                }
              />
            ),
          });
        }
        if (inCol) {
          sections.push({ id: 'tag-overlap', node: <TagCoOccurrence vnId={vn.id} /> });
          sections.push({
            id: 'similar',
            node: (
              <Link
                href={`/similar?vn=${vn.id}`}
                className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-bg-card px-3 py-2 text-xs font-bold text-muted hover:border-accent hover:text-accent"
              >
                <Sparkles className="h-3 w-3" aria-hidden /> {t.similar.moreLink}
              </Link>
            ),
          });
          sections.push({
            id: 'my-editions',
            node: (
              <OwnedEditionsSection
                vnId={vn.id}
                parentVnTitle={vn.title}
                parentVnCover={{
                  url: vn.image_url ?? null,
                  localPath: vn.local_image || vn.local_image_thumb,
                  sexual: vn.image_sexual ?? null,
                }}
              />
            ),
          });
        }
        sections.push({
          id: 'releases',
          node: (
            <ReleasesSection
              vnId={vn.id}
              inCollection={inCol}
              initialOpen={sectionOpens('releases')}
            />
          ),
        });
        sections.push({
          id: 'quotes',
          node: <QuotesSection vnId={vn.id} initialOpen={sectionOpens('quotes')} />,
        });
        if (inCol) {
          sections.push({
            id: 'cover-banner-tools',
            node: (
              <div className="grid gap-4 md:grid-cols-2">
                <CoverUploader vnId={vn.id} hasCustom={!!vn.custom_cover} />
                <BannerControls vnId={vn.id} hasCustomBanner={customBanner} />
              </div>
            ),
          });
        }
        sections.push({
          id: 'edit-form',
          node: <EditForm vn={vn} inCollection={inCol} allSeries={allSeries} />,
        });
        return (
          <VnDetailLayout
            vnId={vn.id}
            initialLayout={layout}
            sections={sections}
          />
        );
      })()}
    </div>
  );
}
