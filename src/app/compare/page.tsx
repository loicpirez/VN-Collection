import Link from 'next/link';
import { ArrowLeft, GitCompare, Star } from 'lucide-react';
import { getCollectionItem } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { LangList } from '@/components/LangFlag';

export const dynamic = 'force-dynamic';

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^(v\d+|egs_\d+)$/i.test(s))
    .slice(0, 4);
}

function fmtMinutes(m: number | null | undefined): string {
  if (!m || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

function intersection<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const out = new Set<T>();
  for (const v of first) if (rest.every((s) => s.has(v))) out.add(v);
  return out;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: idsRaw } = await searchParams;
  const ids = parseIds(idsRaw);
  const t = await getDict();

  const items = ids
    .map((id) => getCollectionItem(id))
    .filter((v): v is NonNullable<typeof v> => v != null);

  // Pre-compute shared sets for highlight columns.
  const tagSets = items.map((it) => new Set((it.tags ?? []).map((t) => t.id)));
  const sharedTagIds = intersection(tagSets);
  const langSets = items.map((it) => new Set(it.languages ?? []));
  const sharedLangs = intersection(langSets);
  const platSets = items.map((it) => new Set(it.platforms ?? []));
  const sharedPlats = intersection(platSets);
  const devSets = items.map((it) => new Set((it.developers ?? []).map((d) => d.name)));
  const sharedDevs = intersection(devSets);
  const staffSets = items.map((it) => new Set((it.staff ?? []).map((s) => s.id)));
  const sharedStaffIds = intersection(staffSets);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <GitCompare className="h-6 w-6 text-accent" /> {t.compareView.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.compareView.subtitle}</p>
      </header>

      {items.length < 2 ? (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          {t.compareView.notEnough}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-card">
          <div
            className="grid gap-px bg-border"
            style={{ gridTemplateColumns: `180px repeat(${items.length}, minmax(220px, 1fr))` }}
          >
            <CellHead label={t.compareView.row.cover} />
            {items.map((it) => (
              <div key={`cover-${it.id}`} className="bg-bg-card p-3">
                <Link href={`/vn/${it.id}`} className="block aspect-[2/3] w-full overflow-hidden rounded">
                  <SafeImage
                    src={it.image_thumb || it.image_url}
                    localSrc={it.local_image_thumb || it.local_image}
                    sexual={it.image_sexual ?? null}
                    alt={it.title}
                    className="h-full w-full"
                  />
                </Link>
                <Link href={`/vn/${it.id}`} className="mt-2 line-clamp-2 block text-sm font-bold hover:text-accent">
                  {it.title}
                </Link>
                {it.alttitle && it.alttitle !== it.title && (
                  <p className="text-[10px] text-muted">{it.alttitle}</p>
                )}
              </div>
            ))}

            <CellHead label={t.compareView.row.rating} />
            {items.map((it) => (
              <div key={`rating-${it.id}`} className="bg-bg-card p-3 text-sm">
                <span className="inline-flex items-baseline gap-1 text-accent">
                  <Star className="h-3 w-3 self-center fill-accent" />
                  {it.rating != null ? (it.rating / 10).toFixed(1) : '—'}
                </span>
                {it.user_rating != null && (
                  <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    {(it.user_rating / 10).toFixed(1)}
                  </span>
                )}
              </div>
            ))}

            <CellHead label={t.compareView.row.released} />
            {items.map((it) => (
              <div key={`released-${it.id}`} className="bg-bg-card p-3 text-sm">{it.released ?? '—'}</div>
            ))}

            <CellHead label={t.compareView.row.length} />
            {items.map((it) => (
              <div key={`len-${it.id}`} className="bg-bg-card p-3 text-sm">{fmtMinutes(it.length_minutes)}</div>
            ))}

            <CellHead label={t.compareView.row.languages} />
            {items.map((it) => (
              <div key={`langs-${it.id}`} className="bg-bg-card p-3 text-xs">
                <LangList langs={it.languages ?? []} />
              </div>
            ))}

            <CellHead label={t.compareView.row.platforms} />
            {items.map((it) => (
              <div key={`plats-${it.id}`} className="bg-bg-card p-3 text-xs">
                {(it.platforms ?? []).map((p) => (
                  <span
                    key={p}
                    className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                      sharedPlats.has(p) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                    }`}
                  >
                    {p}
                  </span>
                ))}
              </div>
            ))}

            <CellHead label={t.compareView.row.developers} />
            {items.map((it) => (
              <div key={`devs-${it.id}`} className="bg-bg-card p-3 text-xs">
                {(it.developers ?? []).map((d, i) => (
                  <span
                    key={`${d.id ?? d.name}-${i}`}
                    className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                      sharedDevs.has(d.name) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                    }`}
                  >
                    {d.name}
                  </span>
                ))}
              </div>
            ))}

            <CellHead label={t.compareView.row.tags} />
            {items.map((it) => (
              <div key={`tags-${it.id}`} className="bg-bg-card p-3 text-xs">
                <div className="flex flex-wrap gap-1">
                  {(it.tags ?? [])
                    .filter((tg) => tg.spoiler === 0)
                    .slice(0, 14)
                    .map((tg) => (
                      <span
                        key={tg.id}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          sharedTagIds.has(tg.id) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                        }`}
                      >
                        {tg.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}

            <CellHead label={t.compareView.row.staff} />
            {items.map((it) => (
              <div key={`staff-${it.id}`} className="bg-bg-card p-3 text-[11px]">
                {(it.staff ?? [])
                  .slice(0, 8)
                  .map((s, i) => (
                    <Link
                      key={`${s.id}-${i}`}
                      href={`/staff/${s.id}`}
                      className={`mr-1 inline-block rounded px-1 py-0.5 hover:bg-accent/15 ${
                        sharedStaffIds.has(s.id) ? 'text-accent' : 'text-muted'
                      }`}
                    >
                      {s.name}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length >= 2 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            {t.compareView.shared.title}
          </h2>
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t.compareView.shared.languages}</p>
              <p className="font-semibold">
                {sharedLangs.size > 0
                  ? Array.from(sharedLangs).map((l) => l.toUpperCase()).join(', ')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t.compareView.shared.platforms}</p>
              <p className="font-semibold">
                {sharedPlats.size > 0 ? Array.from(sharedPlats).join(', ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t.compareView.shared.developers}</p>
              <p className="font-semibold">
                {sharedDevs.size > 0 ? Array.from(sharedDevs).join(', ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t.compareView.shared.tags}</p>
              <p className="font-semibold">
                {sharedTagIds.size} {t.compareView.shared.tagsSuffix}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function CellHead({ label }: { label: string }) {
  return (
    <div className="sticky left-0 bg-bg-elev/60 p-3 text-[10px] font-bold uppercase tracking-wider text-muted">
      {label}
    </div>
  );
}
