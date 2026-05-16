import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Mic2, Users } from 'lucide-react';
import { findBrandStaffOverlap } from '@/lib/brand-overlap';
import { getDict } from '@/lib/i18n/server';
import { roleLabel } from '@/lib/staff-roles';
import { BrandOverlapPicker } from '@/components/BrandOverlapPicker';

export const dynamic = 'force-dynamic';

function parsePid(s: string | undefined): string | null {
  if (!s) return null;
  return /^p\d+$/i.test(s) ? s.toLowerCase() : null;
}

function formatRoles(roles: string[], t: Awaited<ReturnType<typeof getDict>>): string {
  return roles
    .map((r) => {
      if (r === 'va') return t.characters.castLabel;
      if (r.startsWith('va:')) return `${t.characters.castLabel}: ${r.slice(3)}`;
      return roleLabel(r, t.staff);
    })
    .join(' / ');
}

export default async function BrandOverlapPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const t = await getDict();
  const { a: rawA, b: rawB } = await searchParams;
  const a = parsePid(rawA);
  const b = parsePid(rawB);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 rounded-md border border-transparent text-sm text-muted hover:text-white md:mb-2 md:border-border md:bg-bg-elev/30 md:px-1.5 md:py-1 md:text-[11px] md:opacity-70 md:hover:border-accent md:hover:opacity-100">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-accent" /> {t.brandOverlap.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.brandOverlap.subtitle}</p>
        <BrandOverlapPicker initialA={a} initialB={b} />
      </header>

      {a && b ? <Result a={a} b={b} /> : (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.brandOverlap.pickHint}
        </p>
      )}
    </div>
  );
}

async function Result({ a, b }: { a: string; b: string }) {
  const t = await getDict();
  const result = await findBrandStaffOverlap(a, b);
  if (result.needsMoreData) {
    return (
      <p className="rounded-xl border border-status-on_hold/40 bg-status-on_hold/10 p-6 text-sm">
        {t.brandOverlap.needsMoreData}
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-3 text-sm">
        <Link href={`/producer/${a}`} className="font-bold hover:text-accent">
          {result.a?.name ?? a}
        </Link>
        <ArrowLeftRight className="h-4 w-4 text-muted" aria-hidden />
        <Link href={`/producer/${b}`} className="font-bold hover:text-accent">
          {result.b?.name ?? b}
        </Link>
        <span className="ml-auto text-[11px] text-muted">
          {result.entries.length} {t.brandOverlap.matches}
        </span>
      </header>

      {result.entries.length === 0 ? (
        <p className="text-sm text-muted">{t.brandOverlap.empty}</p>
      ) : (
        <ul className="space-y-2">
          {result.entries.map((e) => (
            <li key={e.sid} className="rounded-lg border border-border bg-bg-elev/30 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/staff/${e.sid}`} className="inline-flex items-center gap-1.5 font-bold hover:text-accent">
                  {e.isVa && <Mic2 className="h-3 w-3 text-accent" aria-hidden />}
                  {e.name}
                  {e.original && e.original !== e.name && (
                    <span className="ml-1 text-[10px] font-normal text-muted">{e.original}</span>
                  )}
                </Link>
                <span className="text-[10px] text-muted">
                  {e.aCredits.length} + {e.bCredits.length}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                <div>
                  <div className="mb-0.5 font-bold text-muted">{result.a?.name ?? a}</div>
                  <ul className="space-y-0.5">
                    {e.aCredits.slice(0, 4).map((c, i) => (
                      <li key={`${c.vn_id}-${i}`}>
                        <Link href={`/vn/${c.vn_id}`} className="hover:text-accent">{c.title}</Link>
                        {c.roles.length > 0 && (
                          <span className="ml-1 text-muted">· {formatRoles(c.roles, t)}</span>
                        )}
                      </li>
                    ))}
                    {e.aCredits.length > 4 && (
                      <li className="text-muted">+{e.aCredits.length - 4}</li>
                    )}
                  </ul>
                </div>
                <div>
                  <div className="mb-0.5 font-bold text-muted">{result.b?.name ?? b}</div>
                  <ul className="space-y-0.5">
                    {e.bCredits.slice(0, 4).map((c, i) => (
                      <li key={`${c.vn_id}-${i}`}>
                        <Link href={`/vn/${c.vn_id}`} className="hover:text-accent">{c.title}</Link>
                        {c.roles.length > 0 && (
                          <span className="ml-1 text-muted">· {formatRoles(c.roles, t)}</span>
                        )}
                      </li>
                    ))}
                    {e.bCredits.length > 4 && (
                      <li className="text-muted">+{e.bCredits.length - 4}</li>
                    )}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
