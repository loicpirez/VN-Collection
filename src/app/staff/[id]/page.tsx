import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Filter, Globe, Mic2, Star, User, Users } from 'lucide-react';
import {
  getStaffProfileFromCredits,
  listStaffProductionCredits,
  listStaffVaCredits,
} from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { VaTimeline } from '@/components/VaTimeline';
import { StaffDownloadButton } from '@/components/StaffDownloadButton';
import { StaffExtraCredits, StaffExtraCreditsSkeleton } from '@/components/StaffExtraCredits';
import { readStaffFullCache } from '@/lib/staff-full';
import { VndbMarkup } from '@/components/VndbMarkup';
import { languageDisplayName } from '@/lib/language-names';

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
  const t = await getDict();
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

  const totalAll = allProduction.length + allVoice.length;
  const totalCol =
    allProduction.filter((c) => c.vn.in_collection).length +
    allVoice.filter((c) => c.vn.in_collection).length;

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

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{profile?.name ?? id}</h1>
            {profile?.original && profile.original !== profile.name && (
              <div className="mt-1 text-sm text-muted">{profile.original}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {profile?.lang && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5">
                  <Globe className="h-3 w-3" aria-hidden />
                  {languageDisplayName(profile.lang)}
                </span>
              )}
              {gender && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5">
                  <User className="h-3 w-3" aria-hidden />
                  {t.staff.gender}:{' '}
                  {gender === 'f' ? t.staff.genderF : gender === 'm' ? t.staff.genderM : gender}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5">
                <Users className="h-3 w-3" aria-hidden />
                {production.length} {t.staff.vnCount} · {t.staff.productionCredits.toLowerCase()}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5">
                <Mic2 className="h-3 w-3" aria-hidden />
                {voice.length} {t.staff.vnCount} · {t.staff.voiceCredits.toLowerCase()}
              </span>
            </div>
            {aliases.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">{t.staff.aliases}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {aliases.map((a) => (
                    <span key={a.aid} className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5">
                      <span className="text-white/85">{a.name}</span>
                      {a.latin && a.latin !== a.name && (
                        <span className="ml-1 text-[10px] text-muted">({a.latin})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {description && (
              <div className="mt-3 whitespace-pre-wrap text-xs text-white/80">
                <VndbMarkup text={description} />
              </div>
            )}
            {extlinks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {extlinks.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
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

      {voice.length > 0 && (
        <div className="mb-6">
          <VaTimeline sid={id} />
        </div>
      )}

      {voice.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Mic2 className="h-4 w-4 text-accent" /> {t.staff.voiceCredits}
            <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {voice.length}</span>
          </h2>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {voice.map((credit) => (
              <li key={credit.vn.id}>
                <VnCard vn={credit.vn} ownedLabel={t.staff.ownedLabel} ownedTitle={t.staff.ownedTitle}>
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
                            className="line-clamp-1 font-semibold text-white/85 hover:text-accent"
                          >
                            {c.name}
                          </Link>
                          {c.original && c.original !== c.name && (
                            <div className="line-clamp-1 text-[10px] text-muted/70">{c.original}</div>
                          )}
                          {c.note && (
                            <div className="line-clamp-1 text-[10px] opacity-70">{c.note}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </VnCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groupedProduction.length > 0 && (
        <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Users className="h-4 w-4 text-accent" /> {t.staff.productionCredits}
            <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {production.length}</span>
          </h2>
          {groupedProduction.map((g) => (
            <div key={g.role} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                {t.staff[ROLE_KEY[g.role]]}
              </h3>
              <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {g.credits.map((credit) => (
                  <li key={credit.vn.id}>
                    <VnCard vn={credit.vn} ownedLabel={t.staff.ownedLabel} ownedTitle={t.staff.ownedTitle} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {production.length === 0 && voice.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.staff.empty}
        </p>
      )}

      <Suspense fallback={<StaffExtraCreditsSkeleton />}>
        <StaffExtraCredits sid={id} knownProdVnIds={knownProdVnIds} knownVaVnIds={knownVaVnIds} />
      </Suspense>
    </div>
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

function VnCard({
  vn,
  ownedLabel,
  ownedTitle,
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
  children?: React.ReactNode;
}) {
  const year = vn.released?.slice(0, 4);
  const ratingDisplay = vn.rating != null ? (vn.rating / 10).toFixed(1) : null;
  // VNDB id format `vN` only — egs_* synthetic ids don't have a
  // public VNDB page. Hide the external link in that case.
  const vndbUrl = /^v\d+$/i.test(vn.id) ? `https://vndb.org/${vn.id}` : null;
  return (
    <div
      className={`flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
        vn.in_collection ? 'border-accent/40' : 'border-border'
      } hover:border-accent`}
    >
      <Link href={`/vn/${vn.id}`} className="block h-24 w-16 shrink-0 overflow-hidden rounded">
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
            className="line-clamp-2 flex-1 text-xs font-bold transition-colors hover:text-accent"
          >
            {vn.title}
          </Link>
          {vndbUrl && (
            <a
              href={vndbUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VNDB"
              title="VNDB"
              className="shrink-0 text-muted hover:text-accent"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
        {vn.alttitle && vn.alttitle !== vn.title && (
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{vn.alttitle}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {ratingDisplay && (
            <span className="inline-flex items-center gap-0.5 text-accent">
              <Star className="h-3 w-3 fill-accent" /> {ratingDisplay}
            </span>
          )}
          {year && <span>{year}</span>}
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
