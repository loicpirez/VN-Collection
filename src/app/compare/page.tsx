import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, GitCompare, Heart, Sparkles, Star, Users } from 'lucide-react';
import { db, getCollectionItem } from '@/lib/db';
import { getDict, getLocale } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n/dictionaries';
import { fmtNum, formatVndbDateString } from '@/lib/locale-number';
import { formatMinutesWithDash as fmtMinutes } from '@/lib/format';
import { roleLabel } from '@/lib/staff-roles';
import { platformLabel } from '@/lib/platform-label';
import { languageDisplayName } from '@/lib/language-names';
import { SafeImage } from '@/components/SafeImage';
import { LangList } from '@/components/LangFlag';
import { SkeletonBlock } from '@/components/Skeleton';
import type { CompareVn } from '@/components/CompareVnPicker';
import { findSharedVasForVns } from '@/lib/compare-credits';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

const CompareVnPicker = nextDynamic(() => import('@/components/CompareVnPicker').then((m) => m.CompareVnPicker), {
  loading: () => (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[88px] w-[180px]" />
        ))}
      </div>
      <SkeletonBlock className="h-9 w-32" />
    </div>
  ),
});

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.compareView.pageTitle };
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(isValidVnId)
    .map(normalizeVnId)
    .slice(0, 4);
}

function intersection<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const out = new Set<T>();
  for (const v of first) if (rest.every((s) => s.has(v))) out.add(v);
  return out;
}

interface SharedCharacter {
  c_id: string;
  c_name: string;
  per_vn: { vn_id: string; va_name: string }[];
}

/** Characters appearing in every VN (cross-VN appearances are rare - recurring side characters / mascots). */
function findSharedCharacters(vnIds: string[]): SharedCharacter[] {
  if (vnIds.length < 2) return [];
  const placeholders = vnIds.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT vn_id, c_id, c_name, va_name FROM vn_va_credit
      WHERE vn_id IN (${placeholders})
    `)
    .all(...vnIds) as Array<{ vn_id: string; c_id: string; c_name: string; va_name: string }>;
  const byChar = new Map<string, { vnIds: Set<string>; entry: SharedCharacter }>();
  for (const r of rows) {
    let bucket = byChar.get(r.c_id);
    if (!bucket) {
      bucket = { vnIds: new Set(), entry: { c_id: r.c_id, c_name: r.c_name, per_vn: [] } };
      byChar.set(r.c_id, bucket);
    }
    bucket.vnIds.add(r.vn_id);
    bucket.entry.per_vn.push({ vn_id: r.vn_id, va_name: r.va_name });
  }
  return Array.from(byChar.values())
    .filter((b) => b.vnIds.size === vnIds.length)
    .map((b) => b.entry);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: idsRaw } = await searchParams;
  const ids = parseIds(idsRaw);
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const items = ids
    .map((id) => getCollectionItem(id))
    .filter((v): v is NonNullable<typeof v> => v != null);

  const resolvedIds = new Set(items.map((it) => it.id));
  const droppedIds = ids.filter((id) => !resolvedIds.has(id));

  // Pre-compute shared sets for highlight columns.
  const tagSets = items.map((it) => new Set(it.tags.map((t) => t.id)));
  const sharedTagIds = intersection(tagSets);
  const langSets = items.map((it) => new Set(it.languages));
  const sharedLangs = intersection(langSets);
  const platSets = items.map((it) => new Set(it.platforms));
  const sharedPlats = intersection(platSets);
  const devSets = items.map((it) => new Set(it.developers.map((d) => d.name)));
  const sharedDevs = intersection(devSets);
  const staffSets = items.map((it) => new Set(it.staff.map((s) => s.id)));
  const sharedStaffIds = intersection(staffSets);

  // Map shared staff ids → display data (name + role for the first VN that has them).
  const sharedStaff = items[0]?.staff?.filter((s) => sharedStaffIds.has(s.id)) ?? [];
  const sharedTagsWithNames = items[0]?.tags?.filter((tg) => sharedTagIds.has(tg.id) && tg.spoiler === 0) ?? [];
  const sharedVas = findSharedVasForVns(items.map((it) => it.id));
  const sharedVaIds = new Set(sharedVas.map((va) => va.sid));
  const sharedCharacters = findSharedCharacters(items.map((it) => it.id));
  const titleById = new Map(items.map((it) => [it.id, it.title]));

  // Similarity score - naive but useful: weighted overlap ratio across tags
  // / staff / devs / langs / plats. Tags carry more signal than platforms,
  // so they're weighted accordingly.
  function ratio(shared: number, union: Set<string | number>[]): number {
    const u = new Set<string | number>();
    for (const s of union) for (const v of s) u.add(v);
    return u.size === 0 ? 0 : shared / u.size;
  }
  const similarityScore = Math.round(
    100 *
      (0.4 * ratio(sharedTagIds.size, tagSets) +
        0.25 * ratio(sharedStaffIds.size, staffSets) +
        0.15 * ratio(sharedDevs.size, devSets) +
        0.1 * ratio(sharedLangs.size, langSets) +
        0.1 * ratio(sharedPlats.size, platSets)),
  );

  const pickerInitialVns: CompareVn[] = items.map((it) => {
    const localThumb = it.local_image_thumb || it.local_image || null;
    const url = localThumb ? `/api/files/${localThumb}` : (it.image_thumb || it.image_url || null);
    return {
      id: it.id,
      title: it.title,
      alttitle: it.alttitle,
      image: url ? { url, thumbnail: url, sexual: it.image_sexual ?? null } : null,
    };
  });

  return (
    <div className="w-full">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <GitCompare className="h-6 w-6 text-accent" aria-hidden /> {t.compareView.title}
        </h1>
        <CompareVnPicker initialVns={pickerInitialVns} />
        {droppedIds.length > 0 && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs text-status-on_hold"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {(droppedIds.length === 1
                ? t.compareView.droppedNoticeSingular
                : t.compareView.droppedNotice
              ).replace('{n}', String(droppedIds.length))}
              {' '}
              {droppedIds.join(', ')}
            </span>
          </p>
        )}
      </header>

      {items.length >= 2 && (
        <section className="mb-6 rounded-2xl border border-accent/40 bg-accent/5 p-6">
          <header className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent">
              <Heart className="h-4 w-4" aria-hidden /> {t.compareView.common.title}
            </h2>
            <span className="text-xs text-muted">
              {t.compareView.common.similarity}: <span className="font-bold text-accent">{similarityScore}%</span>
            </span>
          </header>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <SharedFacet
              label={t.compareView.shared.languages}
              values={Array.from(sharedLangs).map((l) => languageDisplayName(l, locale))}
            />
            <SharedFacet
              label={t.compareView.shared.platforms}
              values={Array.from(sharedPlats)}
            />
            <SharedFacet
              label={t.compareView.shared.developers}
              values={Array.from(sharedDevs)}
            />
            <SharedFacet
              label={t.compareView.common.staff}
              values={sharedStaff.slice(0, 12).map((s) => `${s.name} (${s.role ? roleLabel(s.role, t.staff) : '-'})`)}
              extra={sharedStaff.length > 12 ? sharedStaff.length - 12 : null}
            />
          </div>
          {sharedTagsWithNames.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">
                {t.compareView.common.tags} / {sharedTagsWithNames.length}
              </p>
              <div className="flex flex-wrap gap-1">
                {sharedTagsWithNames.map((tg) => (
                  <Link
                    key={tg.id}
                    href={`/?tag=${encodeURIComponent(tg.id)}`}
                    className="rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/30 hover:opacity-80"
                  >
                    {tg.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {sharedVas.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
                <Sparkles className="h-3 w-3" aria-hidden /> {t.compareView.common.vas} / {sharedVas.length}
              </p>
              <ul className="space-y-0.5 text-[11px]">
                {sharedVas.slice(0, 10).map((va) => (
                  <li key={va.sid}>
                    <Link href={`/staff/${va.sid}`} className="font-bold hover:text-accent">{va.va_name}</Link>
                    <span className="ml-2 text-muted">
                      {va.creditsByVn
                        .map((credit) => {
                          const names = credit.characters.map((c) => c.c_name).join(', ');
                          return `${titleById.get(credit.vn_id) ?? credit.vn_id}: ${names}`;
                        })
                        .join(' / ')}
                    </span>
                  </li>
                ))}
                {sharedVas.length > 10 && (
                  <li className="text-muted">+{sharedVas.length - 10}</li>
                )}
              </ul>
            </div>
          )}
          {sharedCharacters.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
                <Users className="h-3 w-3" aria-hidden /> {t.compareView.common.characters} / {sharedCharacters.length}
              </p>
              <ul className="space-y-0.5 text-[11px]">
                {sharedCharacters.slice(0, 10).map((c) => (
                  <li key={c.c_id}>
                    <Link href={`/character/${c.c_id}`} className="font-bold hover:text-accent">{c.c_name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {items.length >= 2 && (
        <div className="scroll-fade-right overflow-x-auto rounded-xl border border-border bg-bg-card">
          <div
            className="grid gap-px bg-border [grid-template-columns:var(--cmp-cols-sm)] sm:[grid-template-columns:var(--cmp-cols-md)]"
            style={{
              ['--cmp-cols-sm' as string]: `100px repeat(${items.length}, minmax(160px, 1fr))`,
              ['--cmp-cols-md' as string]: `180px repeat(${items.length}, minmax(220px, 1fr))`,
            } as React.CSSProperties}
          >
            <CellHead label={t.compareView.row.cover} />
            {items.map((it) => (
              <div key={`cover-${it.id}`} className="bg-bg-card p-3">
                <Link
                  href={`/vn/${it.id}`}
                  className="mx-auto block aspect-[2/3] w-full max-w-[140px] overflow-hidden rounded"
                >
                  {/* Use the full-resolution image when we have it locally
                      so the cover doesn't look pixellated from upscaling
                      a 256px thumbnail. SafeImage prefers `localSrc` and
                      falls back to `src`. */}
                  <SafeImage
                    src={it.image_url || it.image_thumb}
                    localSrc={it.local_image || it.local_image_thumb}
                    sexual={it.image_sexual ?? null}
                    alt={it.title}
                    className="h-full w-full"
                  />
                </Link>
                <Link href={`/vn/${it.id}`} title={it.title} className="mt-2 line-clamp-2 block text-sm font-bold hover:text-accent">
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
                  <Star className="h-3 w-3 self-center fill-accent" aria-hidden />
                  {it.rating != null ? fmtNum(it.rating / 10, locale, 1) : '-'}
                </span>
                {it.user_rating != null && (
                  <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    {fmtNum(it.user_rating / 10, locale, 1)}
                  </span>
                )}
              </div>
            ))}

            <CellHead label={t.compareView.row.released} />
            {items.map((it) => (
              <div key={`released-${it.id}`} className="bg-bg-card p-3 text-sm">
                {formatVndbDateString(it.released, locale)}
              </div>
            ))}

            <CellHead label={t.compareView.row.length} />
            {items.map((it) => (
              <div key={`len-${it.id}`} className="bg-bg-card p-3 text-sm">{fmtMinutes(it.length_minutes, locale, t)}</div>
            ))}

            <CellHead label={t.compareView.row.languages} />
            {items.map((it) => (
              <div key={`langs-${it.id}`} className="bg-bg-card p-3 text-xs">
                <LangList langs={it.languages} locale={locale} />
              </div>
            ))}

            <CellHead label={t.compareView.row.platforms} />
            {items.map((it) => (
              <div key={`plats-${it.id}`} className="bg-bg-card p-3 text-xs">
                {it.platforms.map((p) => (
                  <span
                    key={p}
                    className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                      sharedPlats.has(p) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                    }`}
                    title={p}
                  >
                    {platformLabel(p)}
                  </span>
                ))}
              </div>
            ))}

            <CellHead label={t.compareView.row.developers} />
            {items.map((it) => (
              <div key={`devs-${it.id}`} className="bg-bg-card p-3 text-xs">
                {it.developers.map((d, i) => {
                  const cls = `mr-1 inline-block rounded px-1.5 py-0.5 ${
                    sharedDevs.has(d.name) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                  }`;
                  return d.id && /^p\d+$/i.test(d.id) ? (
                    <Link key={`${d.id}-${i}`} href={`/producer/${d.id}`} className={`${cls} hover:underline`}>
                      {d.name}
                    </Link>
                  ) : (
                    <span key={`${d.name}-${i}`} className={cls}>{d.name}</span>
                  );
                })}
              </div>
            ))}

            <CellHead label={t.compareView.row.tags} />
            {items.map((it) => (
              <div key={`tags-${it.id}`} className="bg-bg-card p-3 text-xs">
                <div className="flex flex-wrap gap-1">
                  {it.tags
                    .filter((tg) => tg.spoiler === 0)
                    .slice(0, 14)
                    .map((tg) => (
                      <Link
                        key={tg.id}
                        href={`/?tag=${encodeURIComponent(tg.id)}`}
                        className={`rounded px-1.5 py-0.5 text-[10px] hover:underline ${
                          sharedTagIds.has(tg.id) ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                        }`}
                      >
                        {tg.name}
                      </Link>
                    ))}
                </div>
              </div>
            ))}

            <CellHead label={t.compareView.row.staff} />
            {items.map((it) => (
              <div key={`staff-${it.id}`} className="bg-bg-card p-3 text-[11px]">
                {it.staff
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

            <CellHead label={t.compareView.row.seiyuu} />
            {items.map((it) => {
              const uniqueVas = Array.from(
                new Map(it.va.map((v) => [`${v.staff.id}|${v.character.id}|${v.note ?? ''}`, v])).values(),
              );
              const vas = uniqueVas
                .sort((a, b) => Number(sharedVaIds.has(b.staff.id)) - Number(sharedVaIds.has(a.staff.id)))
                .slice(0, 10);
              return (
                <div key={`va-${it.id}`} className="bg-bg-card p-3 text-[11px]">
                  {vas.length === 0 ? (
                    <span className="text-muted/60">-</span>
                  ) : (
                    vas.map((v) => {
                      const shared = sharedVaIds.has(v.staff.id);
                      return (
                        <Link
                          key={`${v.staff.id}-${v.character.id}-${v.note ?? 'credit'}`}
                          href={`/staff/${v.staff.id}`}
                          className={`mr-1 inline-block rounded px-1 py-0.5 hover:bg-accent/15 hover:text-accent ${
                            shared ? 'bg-accent/15 font-bold text-accent' : 'text-muted'
                          }`}
                          title={`${v.character.name}${v.note ? ` / ${v.note}` : ''}`}
                        >
                          {v.staff.name}
                        </Link>
                      );
                    })
                  )}
                  {uniqueVas.length > vas.length && (
                    <span className="text-muted">+{uniqueVas.length - vas.length}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

function CellHead({ label }: { label: string }) {
  return (
    <div className="sticky left-0 z-10 bg-bg-elev p-3 text-[10px] font-bold uppercase tracking-wider text-muted">
      {label}
    </div>
  );
}

function SharedFacet({ label, values, extra }: { label: string; values: string[]; extra?: number | null }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{label}</p>
      {values.length === 0 ? (
        <p className="text-muted">-</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="rounded bg-accent/20 px-1.5 py-0.5 font-bold text-accent">{v}</span>
          ))}
          {extra ? <span className="text-muted">+{extra}</span> : null}
        </div>
      )}
    </div>
  );
}
