import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Filter, Mic2, Star, Users } from 'lucide-react';
import {
  getStaffProfileFromCredits,
  listStaffProductionCredits,
  listStaffVaCredits,
} from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

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
  const production = listStaffProductionCredits(id, { inCollectionOnly });
  const voice = listStaffVaCredits(id, { inCollectionOnly });
  if (!profile && production.length === 0 && voice.length === 0) notFound();

  const totalAll = listStaffProductionCredits(id).length + listStaffVaCredits(id).length;
  const totalCol = listStaffProductionCredits(id, { inCollectionOnly: true }).length
    + listStaffVaCredits(id, { inCollectionOnly: true }).length;

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

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{profile?.name ?? id}</h1>
            {profile?.original && profile.original !== profile.name && (
              <div className="mt-1 text-sm text-muted">{profile.original}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
              {profile?.lang && <span>{profile.lang.toUpperCase()}</span>}
              <span>
                {production.length} {t.staff.vnCount} · {t.staff.productionCredits.toLowerCase()}
              </span>
              <span>
                {voice.length} {t.staff.vnCount} · {t.staff.voiceCredits.toLowerCase()}
              </span>
            </div>
          </div>
          <a
            href={`https://vndb.org/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn self-start"
          >
            <ExternalLink className="h-4 w-4" /> VNDB
          </a>
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
        <section className="mb-6 rounded-xl border border-border bg-bg-card p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Mic2 className="h-4 w-4 text-accent" /> {t.staff.voiceCredits}
            <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {voice.length}</span>
          </h2>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {voice.map((credit) => (
              <li key={credit.vn.id}>
                <VnCard vn={credit.vn}>
                  <ul className="mt-2 space-y-1 text-[11px] text-muted">
                    {credit.characters.map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/character/${c.id}`} className="truncate font-semibold text-white/85 hover:text-accent">
                          {c.name}
                        </Link>
                        {c.note && <span className="shrink-0 text-[10px] opacity-70">{c.note}</span>}
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
        <section className="rounded-xl border border-border bg-bg-card p-6">
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
                    <VnCard vn={credit.vn} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {production.length === 0 && voice.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          {t.staff.empty}
        </p>
      )}
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
  children?: React.ReactNode;
}) {
  const year = vn.released?.slice(0, 4);
  const ratingDisplay = vn.rating != null ? (vn.rating / 10).toFixed(1) : null;
  return (
    <div
      className={`flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
        vn.in_collection ? 'border-accent/40' : 'border-border'
      } hover:border-accent`}
    >
      <Link href={`/vn/${vn.id}`} className="block h-24 w-16 shrink-0 overflow-hidden rounded">
        <SafeImage
          src={vn.image_thumb || vn.image_url}
          localSrc={vn.local_image_thumb || vn.local_image}
          sexual={vn.image_sexual}
          alt={vn.title}
          className="h-full w-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/vn/${vn.id}`}
          className="line-clamp-2 text-xs font-bold transition-colors hover:text-accent"
        >
          {vn.title}
        </Link>
        {vn.alttitle && vn.alttitle !== vn.title && (
          <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{vn.alttitle}</div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
          {ratingDisplay && (
            <span className="inline-flex items-center gap-0.5 text-accent">
              <Star className="h-3 w-3 fill-accent" /> {ratingDisplay}
            </span>
          )}
          {year && <span>{year}</span>}
          {vn.in_collection && (
            <span className="rounded bg-accent/15 px-1.5 text-[9px] font-bold uppercase tracking-wider text-accent">
              ★
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
