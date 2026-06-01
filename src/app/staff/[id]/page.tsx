import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Filter, Globe, Mic2, Star, User, Users } from 'lucide-react';
import {
  findStaffSiblings,
  getAppSetting,
  getStaffProfileFromCredits,
  listStaffProductionCredits,
  listStaffVaCredits,
} from '@/lib/db';
import { getDict, getLocale } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n/dictionaries';
import { fmtNum } from '@/lib/locale-number';
import { SafeImage } from '@/components/SafeImage';
import { VaTimeline } from '@/components/VaTimeline';
import { StaffDownloadButton } from '@/components/StaffDownloadButton';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { StaffExtraCredits, StaffExtraCreditsSkeleton } from '@/components/StaffExtraCredits';
import { readStaffFullCache } from '@/lib/staff-full';
import { VndbMarkup } from '@/components/VndbMarkup';
import { languageDisplayName } from '@/lib/language-names';
import { safeHref } from '@/lib/safe-href';
import { DetailReorderLayout, type DetailSection } from '@/components/DetailReorderLayout';
import {
  STAFF_DETAIL_LAYOUT_EVENT,
  STAFF_DETAIL_SETTINGS_KEY,
  STAFF_SECTION_IDS,
  parseStaffDetailLayoutV1,
} from '@/lib/staff-detail-layout';

import { isVndbVnId } from '@/lib/vn-id-shape';
export const dynamic = 'force-dynamic';

const ROLE_ORDER = ['scenario', 'chardesign', 'art', 'music', 'songs', 'director', 'producer', 'staff'] as const;
const ROLE_KEY: Record<string, 'role_scenario' | 'role_chardesign' | 'role_art' | 'role_music' | 'role_songs' | 'role_director' | 'role_producer' | 'role_staff'> = {
  scenario: 'role_scenario',
  chardesign: 'role_chardesign',
  art: 'role_art',
  music: 'role_music',
  songs: 'role_songs',
  director: 'role_director',
  producer: 'role_producer',
  staff: 'role_staff',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = getStaffProfileFromCredits(id);
  return profile?.name ? { title: profile.name } : {};
}

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { id } = await params;
  if (!/^s\d+$/i.test(id)) notFound();
  const { scope } = await searchParams;
  const inCollectionOnly = scope === 'collection';
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const profile = getStaffProfileFromCredits(id);
  // Fetch the all-credits arrays once, then derive both filtered
  // views + the toggle counters from them in JS. The previous flow
  // ran four heavy SQL queries per page load; with prolific staff
  // (e.g. seiyuu with 500+ credits) that was the page's biggest cost.
  const allProduction = listStaffProductionCredits(id);
  const allVoice = listStaffVaCredits(id);
  const production = inCollectionOnly
    ? allProduction.filter((c) => c.vn.in_collection)
    : allProduction;
  const voice = inCollectionOnly
    ? allVoice.filter((c) => c.vn.in_collection)
    : allVoice;
  if (!profile && production.length === 0 && voice.length === 0) notFound();

  const staffSiblings = findStaffSiblings(id);

  const totalAll = countDistinctVnIds(allProduction, allVoice);
  const totalCol = countDistinctVnIds(
    allProduction.filter((c) => c.vn.in_collection),
    allVoice.filter((c) => c.vn.in_collection),
  );

  // Locally-known credits paint immediately. The full VNDB download streams
  // in via <Suspense> in <StaffExtraCredits> below — that lets the user see
  // what we already have without waiting on the network roundtrip.
  const knownProdVnIds = new Set(production.map((c) => c.vn.id));
  const knownVaVnIds = new Set(voice.map((c) => c.vn.id));

  // Pull richer profile fields (aliases, description, extlinks, gender)
  // from the staff_full cache — `getStaffProfileFromCredits` only knows
  // about credits and gives us a single canonical name.
  const fullProfile = readStaffFullCache(id)?.profile ?? null;
  const aliases = (fullProfile?.aliases ?? []).filter((a) => !a.ismain);
  const extlinks = fullProfile?.extlinks ?? [];
  const description = fullProfile?.description ?? null;
  const gender = fullProfile?.gender ?? null;

  const prodByRole = new Map<string, typeof production>();
  for (const credit of production) {
    for (const r of credit.roles) {
      const key = ROLE_KEY[r.role] ? r.role : 'staff';
      if (!prodByRole.has(key)) prodByRole.set(key, []);
      prodByRole.get(key)!.push(credit);
    }
  }
  const groupedProduction = ROLE_ORDER
    .map((role) => ({ role, credits: dedupeByVnId(prodByRole.get(role) ?? []) }))
    .filter((g) => g.credits.length > 0);
  const initialStaffLayout = parseStaffDetailLayoutV1(getAppSetting(STAFF_DETAIL_SETTINGS_KEY));

  return (
    <DensityScopeProvider scope="staffWorks" className="w-full">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold">{profile?.name ?? id}</h1>
            {profile?.original && profile.original !== profile.name && (
              <div className="mt-1 break-words text-sm text-muted">{profile.original}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {profile?.lang && (
                <Link
                  href={`/staff?lang=${encodeURIComponent(profile.lang)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 hover:border-accent hover:text-accent"
                  title={profile.lang}
                >
                  <Globe className="h-3 w-3" aria-hidden />
                  {languageDisplayName(profile.lang)}
                </Link>
              )}
              {gender && (
                <Link
                  href={`/staff?sex=${encodeURIComponent(gender)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 hover:border-accent hover:text-accent"
                >
                  <User className="h-3 w-3" aria-hidden />
                  {t.staff.gender}:{' '}
                  {gender === 'f' ? t.staff.genderF : gender === 'm' ? t.staff.genderM : gender}
                </Link>
              )}
              <a
                href="#production-credits"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 lowercase hover:border-accent hover:text-accent"
                title={t.staff.productionCredits}
              >
                <Users className="h-3 w-3" aria-hidden />
                {production.length} {t.staff.vnCount} · {t.staff.productionCredits}
              </a>
              <a
                href="#voice-credits"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 lowercase hover:border-accent hover:text-accent"
                title={t.staff.voiceCredits}
              >
                <Mic2 className="h-3 w-3" aria-hidden />
                {voice.length} {t.staff.vnCount} · {t.staff.voiceCredits}
              </a>
            </div>
            {aliases.length > 0 && (
              <section className="mt-3" aria-label={t.staff.aliasesLabel}>
                <div className="text-[10px] uppercase tracking-wider text-muted">{t.staff.aliasesLabel}</div>
                <ul className="mt-1 flex flex-wrap gap-1.5 text-xs" role="list">
                  {aliases.map((a) => (
                    <li
                      key={a.aid}
                      className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5"
                    >
                      <span className="text-white/85">{a.name}</span>
                      {a.latin && a.latin !== a.name && (
                        <span className="ml-1 text-[10px] text-muted">({a.latin})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {description && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">{t.staff.descriptionLabel}</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-white/80">
                  <VndbMarkup text={description} spoilerLabel={t.spoiler.markupSummary} />
                </div>
              </div>
            )}
            {extlinks.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">{t.staff.extlinksLabel}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {extlinks.map((l) => {
                    const href = safeHref(l.url);
                    if (!href) return null;
                    return (
                      <a
                        key={l.url}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
                      >
                        {l.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            {/* Density slider mounted in the header so the user can
                resize the VN grids below without scrolling back up.
                Matches the convention used on every other listing
                surface (/wishlist, /recommendations, /top-ranked,
                /upcoming, /dumped, /egs, /similar). */}
            <CardDensitySlider scope="staffWorks" />
            <StaffDownloadButton sid={id} />
            <a
              href={`https://vndb.org/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-4 w-4" /> VNDB
            </a>
          </div>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev p-1 text-xs">
          <Filter className="ml-1 h-3 w-3 text-muted" />
          <Link
            href={`/staff/${id}`}
            className={`rounded px-2 py-1 ${!inCollectionOnly ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          >
            {t.staff.filterAll} ({totalAll})
          </Link>
          <Link
            href={`/staff/${id}?scope=collection`}
            className={`rounded px-2 py-1 ${inCollectionOnly ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          >
            {t.staff.filterInCollection} ({totalCol})
          </Link>
        </div>
      </header>

      {(() => {
        const sectionLabels = t.staffLayout.sectionLabels;
        const staffSections: DetailSection[] = [];
        if (voice.length > 0) staffSections.push({
          id: 'timeline',
          label: sectionLabels.timeline,
          node: <div className="mb-6"><VaTimeline sid={id} /></div>,
        });
        if (staffSiblings.length > 0) staffSections.push({
          id: 'siblings',
          label: sectionLabels.siblings,
          node: (
            <section className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
              <h2 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
                <Users className="h-4 w-4" /> {t.staff.siblingsTitle}
              </h2>
              <p className="mb-3 text-[11px] text-muted">{t.staff.siblingsHint}</p>
              <ul className="space-y-1.5 text-xs">
                {staffSiblings.map((sib) => (
                  <li key={sib.sid} className="flex flex-wrap items-baseline gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                      {t.staff.siblingsPossibleMatch}
                    </span>
                    <Link href={`/staff/${sib.sid}`} className="font-bold hover:text-accent">{sib.name}</Link>
                    <span className="font-mono text-[10px] text-muted">{sib.sid}</span>
                    {sib.original && sib.original !== sib.name && (
                      <span className="text-[11px] text-muted">{sib.original}</span>
                    )}
                    <span className="text-muted">·</span>
                    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                      {sib.vns.map((v, i) => (
                        <span key={v.vn_id}>
                          <Link href={`/vn/${v.vn_id}`} className="hover:text-accent">{v.vn_title}</Link>
                          {i < sib.vns.length - 1 && <span className="text-muted">,</span>}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ),
        });
        if (voice.length > 0) staffSections.push({
          id: 'voice-credits',
          label: sectionLabels['voice-credits'],
          node: <section id="voice-credits" className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Mic2 className="h-4 w-4 text-accent" /> {t.staff.voiceCredits}
            <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {voice.length}</span>
          </h2>
          <ul
            className="grid gap-3"
            style={{
              // Density-aware: voice cards carry a fair amount of
              // per-character detail so the default fallback is
              // 280px (was a hard floor). User can dial the column
              // count via the global density slider.
              gridTemplateColumns:
                'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))',
            }}
          >
            {voice.map((credit) => (
              <li key={credit.vn.id}>
                <VnCard vn={credit.vn} ownedLabel={t.staff.ownedLabel} ownedTitle={t.staff.ownedTitle} openOnVndb={t.detail.openOnVndb} locale={locale}>
                  {/*
                    Each voiced character renders with a thumbnail
                    next to the name. The thumbnail uses the local
                    mirror when available (populated by the
                    "Download all" / per-VN fan-out) so the page
                    works offline once the data is cached.
                  */}
                  <ul className="mt-2 space-y-1.5 text-[11px] text-muted">
                    {credit.characters.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <Link
                          href={`/character/${c.id}`}
                          className="block h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-bg-elev/40"
                          aria-label={c.name}
                        >
                          <SafeImage
                            src={c.image_url}
                            localSrc={c.local_image}
                            alt={c.name}
                            className="h-full w-full"
                          />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/character/${c.id}`}
                            title={c.name}
                            className="line-clamp-1 font-semibold text-white/85 hover:text-accent"
                          >
                            {c.name}
                          </Link>
                          {c.original && c.original !== c.name && (
                            <div title={c.original} className="line-clamp-1 text-[10px] text-muted/70">{c.original}</div>
                          )}
                          {c.note && (
                            <div title={c.note} className="line-clamp-1 text-[10px] opacity-70">{c.note}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </VnCard>
              </li>
            ))}
          </ul>
        </section>,
        });
        if (groupedProduction.length > 0) staffSections.push({
          id: 'production-credits',
          label: sectionLabels['production-credits'],
          node: (
            <section id="production-credits" className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
              <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
                <Users className="h-4 w-4 text-accent" /> {t.staff.productionCredits}
                <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {production.length}</span>
              </h2>
              {groupedProduction.map((g) => (
                <div key={g.role} className="mb-6 last:mb-0">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                    {t.staff[ROLE_KEY[g.role]]}
                  </h3>
                  <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}>
                    {g.credits.map((credit) => (
                      <li key={credit.vn.id}>
                        <VnCard vn={credit.vn} ownedLabel={t.staff.ownedLabel} ownedTitle={t.staff.ownedTitle} openOnVndb={t.detail.openOnVndb} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ),
        });
        staffSections.push({
          id: 'extra-credits',
          label: sectionLabels['extra-credits'],
          node: (
            <Suspense fallback={<StaffExtraCreditsSkeleton />}>
              <StaffExtraCredits sid={id} knownProdVnIds={knownProdVnIds} knownVaVnIds={knownVaVnIds} />
            </Suspense>
          ),
        });
        if (production.length === 0 && voice.length === 0) {
          return (
            <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
              {t.staff.empty}
            </p>
          );
        }
        return (
          <DetailReorderLayout
            sections={staffSections}
            initialLayout={initialStaffLayout}
            sectionIds={STAFF_SECTION_IDS}
            settingsKey={STAFF_DETAIL_SETTINGS_KEY}
            eventName={STAFF_DETAIL_LAYOUT_EVENT}
            identityKey={id}
          />
        );
      })()}
    </DensityScopeProvider>
  );
}

function dedupeByVnId<T extends { vn: { id: string } }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.vn.id)) return false;
    seen.add(i.vn.id);
    return true;
  });
}

function countDistinctVnIds(...groups: Array<Array<{ vn: { id: string } }>>): number {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const item of group) ids.add(item.vn.id);
  }
  return ids.size;
}

function VnCard({
  vn,
  ownedLabel,
  ownedTitle,
  openOnVndb,
  locale,
  children,
}: {
  vn: {
    id: string;
    title: string;
    alttitle: string | null;
    image_url: string | null;
    image_thumb: string | null;
    image_sexual: number | null;
    local_image: string | null;
    local_image_thumb: string | null;
    released: string | null;
    rating: number | null;
    in_collection: boolean;
  };
  ownedLabel: string;
  ownedTitle: string;
  openOnVndb: string;
  locale: Locale;
  children?: React.ReactNode;
}) {
  const year = vn.released?.slice(0, 4);
  const ratingDisplay = vn.rating != null ? fmtNum(vn.rating / 10, locale, 1) : null;
  // VNDB id format `vN` only — egs_* synthetic ids don't have a
  // public VNDB page. Hide the external link in that case.
  const vndbUrl = isVndbVnId(vn.id) ? `https://vndb.org/${vn.id}` : null;
  return (
    <div
      className={`flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
        vn.in_collection ? 'border-accent/40' : 'border-border'
      } hover:border-accent`}
    >
      {/* Density-aware row cover. Multiplier matches the
          producer / top-ranked / upcoming row card formula so all
          row-style cards scale at the same rate as the slider. */}
      <Link
        href={`/vn/${vn.id}`}
        className="block shrink-0 overflow-hidden rounded"
        style={{
          width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
          aspectRatio: '2 / 3',
        }}
      >
        <SafeImage
          src={vn.image_url || vn.image_thumb}
          localSrc={vn.local_image || vn.local_image_thumb}
          sexual={vn.image_sexual}
          alt={vn.title}
          className="h-full w-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/vn/${vn.id}`}
            title={vn.title}
            className="line-clamp-2 flex-1 text-xs font-bold transition-colors hover:text-accent"
          >
            {vn.title}
          </Link>
          {vndbUrl && (
            <a
              href={vndbUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={openOnVndb}
              title={openOnVndb}
              className="shrink-0 text-muted hover:text-accent"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
        {vn.alttitle && vn.alttitle !== vn.title && (
          <div title={vn.alttitle} className="mt-0.5 line-clamp-1 text-[11px] text-muted">{vn.alttitle}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {ratingDisplay && (
            <span className="inline-flex items-center gap-0.5 text-accent">
              <Star className="h-3 w-3 fill-accent" /> {ratingDisplay}
            </span>
          )}
          {year && (
            <Link
              href={`/?yearMin=${year}&yearMax=${year}`}
              className="hover:border-accent hover:text-accent"
              title={year}
            >
              {year}
            </Link>
          )}
          {vn.in_collection && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              title={ownedTitle}
            >
              <Star className="h-2.5 w-2.5 fill-accent" aria-hidden /> {ownedLabel}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
