import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Mic2, Star, Users } from 'lucide-react';
import { getCharacter, type VndbCharacter } from '@/lib/vndb';
import { findCharacterSiblings, getVasForCharacter } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CharacterMetaClient } from '@/components/CharacterMetaClient';
import { readScrapedCharacterInfo } from '@/lib/scrape-character-instances';

export const dynamic = 'force-dynamic';

const ROLE_ORDER: Record<string, number> = { main: 0, primary: 1, side: 2, appears: 3 };

function fmtBirthday(b: [number, number] | null): string | null {
  if (!b) return null;
  const [m, d] = b;
  if (!m) return null;
  if (!d) return new Date(0, m - 1).toLocaleString('default', { month: 'long' });
  return `${d}/${String(m).padStart(2, '0')}`;
}

function sexLabel(s: [string | null, string | null] | null, idx: 0 | 1 = 0): string | null {
  if (!s) return null;
  const v = s[idx];
  const map: Record<string, string> = { m: '♂', f: '♀', b: '♂♀', n: '∅' };
  return v == null ? null : (map[v] ?? v);
}

function genderLabel(g: [string | null, string | null] | null, idx: 0 | 1 = 0): string | null {
  if (!g) return null;
  const v = g[idx];
  const map: Record<string, string> = { m: '♂', f: '♀', o: 'non-binary', a: 'ambiguous' };
  return v == null ? null : (map[v] ?? v);
}

function stripBb(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2').replace(/\[\/?[a-z]+\]/gi, '');
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^c\d+$/i.test(id)) notFound();
  const t = await getDict();
  let char: VndbCharacter | null = null;
  try {
    char = await getCharacter(id);
  } catch {
    char = null;
  }
  if (!char) notFound();

  const meta: { label: string; value: string }[] = [];
  if (char.age != null) meta.push({ label: t.characters.age, value: `${char.age}` });
  if (char.height != null) meta.push({ label: t.characters.height, value: `${char.height} cm` });
  if (char.weight != null) meta.push({ label: t.characters.weight, value: `${char.weight} kg` });
  if (char.bust != null) meta.push({ label: t.characters.bust, value: `${char.bust} cm` });
  if (char.waist != null) meta.push({ label: t.characters.waist, value: `${char.waist} cm` });
  if (char.hips != null) meta.push({ label: t.characters.hips, value: `${char.hips} cm` });
  if (char.cup) meta.push({ label: t.characters.cup, value: char.cup });
  if (char.blood_type) meta.push({ label: t.characters.bloodType, value: char.blood_type.toUpperCase() });
  const bday = fmtBirthday(char.birthday);
  if (bday) meta.push({ label: t.characters.birthday, value: bday });
  const sexA = sexLabel(char.sex, 0);
  if (sexA) meta.push({ label: t.characters.sex, value: sexA });
  const genderA = genderLabel(char.gender, 0);
  if (genderA) meta.push({ label: t.characters.gender, value: genderA });

  const sortedVns = [...char.vns].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );
  // "Also voiced by" comes from local vn_va_credit (covers every VN the
  // user has fetched). VNDB doesn't expose per-VN voiced data on the
  // character endpoint, so we don't try to cross-reference unowned VNs.
  const vas = getVasForCharacter(id);
  // Other VNDB character records with the SAME display name — covers the
  // case where VNDB editors split a recurring character (e.g. Aikiss 1's
  // Saegusa Hinata at c11994 vs Aikiss 3's at c89053).
  const siblings = findCharacterSiblings(id);
  // vndb.org HTML scrape — provides character "instances" and the full
  // per-VN voice-actor map that the Kana API doesn't expose.
  const scraped = readScrapedCharacterInfo(id);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <div className="grid gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:gap-6 sm:p-6 md:grid-cols-[200px_1fr] md:gap-8">
        <SafeImage
          src={char.image?.url ?? null}
          sexual={char.image?.sexual ?? null}
          alt={char.name}
          className="aspect-[2/3] w-full rounded-xl"
        />
        <div>
          <h1 className="text-2xl font-bold">{char.name}</h1>
          {char.original && char.original !== char.name && (
            <div className="mt-1 text-muted">{char.original}</div>
          )}
          {char.aliases.length > 0 && (
            <div className="mt-1 text-xs text-muted">{char.aliases.slice(0, 6).join(' · ')}</div>
          )}

          {meta.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-[11px] uppercase tracking-wider text-muted">{m.label}</dt>
                  <dd className="font-semibold">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-4">
            <a
              href={`https://vndb.org/${char.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-4 w-4" /> VNDB ↗
            </a>
          </div>
        </div>
      </div>

      {siblings.length > 0 && (
        <section className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
            <Users className="h-4 w-4" /> {t.characters.sameName}
          </h3>
          <p className="mb-3 text-[11px] text-muted">{t.characters.sameNameHint}</p>
          <ul className="space-y-1.5 text-xs">
            {siblings.map((s) => (
              <li key={s.c_id} className="flex flex-wrap items-baseline gap-2">
                <Link href={`/character/${s.c_id}`} className="font-bold hover:text-accent">
                  {s.c_name}
                </Link>
                <span className="font-mono text-[10px] text-muted">{s.c_id}</span>
                <span className="text-muted">·</span>
                <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                  {s.vns.map((v, i) => (
                    <span key={v.vn_id}>
                      <Link href={`/vn/${v.vn_id}`} className="hover:text-accent">{v.vn_title}</Link>
                      {i < s.vns.length - 1 && <span className="text-muted">,</span>}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {char.description && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.detail.synopsis}</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{stripBb(char.description)}</p>
        </section>
      )}

      <CharacterMetaClient char={char} />

      {scraped && scraped.instances.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Users className="h-4 w-4 text-accent" /> {t.characters.instances}
            <span className="text-[10px] font-normal text-muted">· {scraped.instances.length}</span>
          </h3>
          <ul className="grid gap-2 text-xs sm:grid-cols-2">
            {scraped.instances.map((inst) => (
              <li key={`${inst.cid}-${inst.vn_id}`} className="flex flex-wrap items-baseline gap-1.5">
                <Link href={`/character/${inst.cid}`} className="font-semibold hover:text-accent">
                  {inst.name}
                </Link>
                <span className="text-muted">·</span>
                <Link href={`/vn/${inst.vn_id}`} className="text-muted hover:text-accent">
                  {inst.vn_title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted/70">{t.characters.instancesHint}</p>
        </section>
      )}

      {scraped && scraped.voiced_by.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Mic2 className="h-4 w-4 text-accent" /> {t.characters.voicedByAll}
            <span className="text-[10px] font-normal text-muted">· {scraped.voiced_by.length}</span>
          </h3>
          <ul className="grid gap-2 text-xs sm:grid-cols-2">
            {scraped.voiced_by.map((v) => (
              <li key={`${v.sid}-${v.vn_id}`} className="flex flex-wrap items-baseline gap-1.5">
                <Link href={`/staff/${v.sid}`} className="font-semibold hover:text-accent">
                  {v.staff_name}
                </Link>
                <span className="text-muted">·</span>
                <Link href={`/vn/${v.vn_id}`} className="text-muted hover:text-accent">
                  {v.vn_title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vas.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Mic2 className="h-4 w-4 text-accent" /> {t.characters.alsoVoicedBy}
          </h3>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {vas.map((va) => (
              <li key={va.sid}>
                <Link
                  href={`/staff/${va.sid}`}
                  className="block rounded-lg border border-border bg-bg-elev/40 p-3 transition-colors hover:border-accent"
                >
                  <div className="font-bold">{va.va_name}</div>
                  {va.va_original && va.va_original !== va.va_name && (
                    <div className="text-[10px] text-muted">{va.va_original}</div>
                  )}
                  <div className="mt-1 text-[11px] text-muted">
                    {va.vns.length} {t.staff.vnCount}
                    {va.vns.some((v) => v.in_collection) && (
                      <span
                        className="ml-1 inline-flex items-center rounded bg-accent/15 px-1 text-accent"
                        aria-label={t.staff.ownedTitle}
                        title={t.staff.ownedTitle}
                      >
                        <Star className="h-2.5 w-2.5 fill-accent" aria-hidden />
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sortedVns.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {t.characters.appearsIn} · {sortedVns.length}
          </h3>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {sortedVns.map((v) => {
              const year = v.released?.slice(0, 4);
              const ratingDisplay = v.rating != null ? (v.rating / 10).toFixed(1) : null;
              const role = t.characters.roles[v.role as keyof typeof t.characters.roles] ?? v.role;
              return (
                <li key={`${v.id}-${v.role}`}>
                  <Link
                    href={`/vn/${v.id}`}
                    className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                  >
                    <SafeImage
                      src={v.image?.thumbnail || v.image?.url || null}
                      sexual={v.image?.sexual ?? null}
                      alt={v.title ?? v.id}
                      className="h-24 w-16 shrink-0 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                          {v.title ?? v.id}
                        </span>
                        <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                          {role}
                        </span>
                      </div>
                      {v.alttitle && v.alttitle !== v.title && (
                        <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{v.alttitle}</div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                        {ratingDisplay && (
                          <span className="inline-flex items-center gap-0.5 text-accent">
                            <Star className="h-2.5 w-2.5 fill-accent" aria-hidden /> {ratingDisplay}
                          </span>
                        )}
                        {year && <span>{year}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
