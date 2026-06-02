import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Mic2, Star, Users } from 'lucide-react';
import { findBrandStaffOverlap } from '@/lib/brand-overlap';
import { isInCollectionMany } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.brandOverlap.title };
}
import { roleLabel } from '@/lib/staff-roles';
import { BrandOverlapPicker } from '@/components/BrandOverlapPicker';

export const dynamic = 'force-dynamic';
const BRAND_OVERLAP_PAGE_SIZE = 20;

function parsePid(s: string | undefined): string | null {
  if (!s) return null;
  return /^p\d+$/i.test(s) ? s.toLowerCase() : null;
}

function parsePage(s: string | undefined): number {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function brandOverlapHref(a: string, b: string, page: number): string {
  const sp = new URLSearchParams({ a, b });
  if (page > 1) sp.set('p', String(page));
  return `/brand-overlap?${sp.toString()}`;
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
  searchParams: Promise<{ a?: string; b?: string; p?: string }>;
}) {
  const t = await getDict();
  const { a: rawA, b: rawB, p: rawPage } = await searchParams;
  const a = parsePid(rawA);
  const b = parsePid(rawB);
  const page = parsePage(rawPage);

  return (
    <div className="w-full">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-accent" aria-hidden /> {t.brandOverlap.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.brandOverlap.subtitle}</p>
        <BrandOverlapPicker initialA={a} initialB={b} />
      </header>

      {a && b ? <Result a={a} b={b} page={page} /> : (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.brandOverlap.pickHint}
        </p>
      )}
    </div>
  );
}

async function Result({ a, b, page }: { a: string; b: string; page: number }) {
  const t = await getDict();
  const result = await findBrandStaffOverlap(a, b);
  if (result.needsMoreData) {
    return (
      <div className="rounded-xl border border-status-on_hold/40 bg-status-on_hold/10 p-6 text-sm">
        <p>{t.brandOverlap.needsMoreData}</p>
        <p className="mt-2 text-xs text-muted">
          <Link href={`/producer/${a}`} className="font-bold text-accent hover:underline">
            {result.a?.name ?? a}
          </Link>
          {' / '}
          <Link href={`/producer/${b}`} className="font-bold text-accent hover:underline">
            {result.b?.name ?? b}
          </Link>
        </p>
      </div>
    );
  }

  const ownedSet = isInCollectionMany(
    result.entries.flatMap((e) => [...e.aCredits, ...e.bCredits].map((c) => c.vn_id)),
  );
  const totalPages = Math.max(1, Math.ceil(result.entries.length / BRAND_OVERLAP_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * BRAND_OVERLAP_PAGE_SIZE;
  const pagedEntries = result.entries.slice(start, start + BRAND_OVERLAP_PAGE_SIZE);

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
        <div className="text-sm text-muted">
          <p>{t.brandOverlap.empty}</p>
          <p className="mt-1 text-xs">
            <Link href={`/producer/${a}`} className="hover:text-accent">
              {result.a?.name ?? a}
            </Link>
            {' / '}
            <Link href={`/producer/${b}`} className="hover:text-accent">
              {result.b?.name ?? b}
            </Link>
          </p>
        </div>
      ) : (
        <>
        <ul className="space-y-2">
          {pagedEntries.map((e) => (
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
                        <Link
                          href={`/vn/${c.vn_id}`}
                          className={ownedSet.has(c.vn_id) ? 'inline-flex items-center gap-1 text-accent hover:text-white' : 'hover:text-accent'}
                          data-in-collection={ownedSet.has(c.vn_id) ? 'true' : undefined}
                        >
                          {ownedSet.has(c.vn_id) && <Star className="h-2.5 w-2.5 fill-accent" aria-hidden />}
                          {c.title}
                        </Link>
                        {c.roles.length > 0 && (
                          <span className="ml-1 text-muted">/ {formatRoles(c.roles, t)}</span>
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
                        <Link
                          href={`/vn/${c.vn_id}`}
                          className={ownedSet.has(c.vn_id) ? 'inline-flex items-center gap-1 text-accent hover:text-white' : 'hover:text-accent'}
                          data-in-collection={ownedSet.has(c.vn_id) ? 'true' : undefined}
                        >
                          {ownedSet.has(c.vn_id) && <Star className="h-2.5 w-2.5 fill-accent" aria-hidden />}
                          {c.title}
                        </Link>
                        {c.roles.length > 0 && (
                          <span className="ml-1 text-muted">/ {formatRoles(c.roles, t)}</span>
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
        {totalPages > 1 && (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs"
            aria-label={t.brandOverlap.paginationLabel}
          >
            <span className="text-muted">
              {t.brandOverlap.pageLabel
                .replace('{current}', String(currentPage))
                .replace('{total}', String(totalPages))}
            </span>
            <div className="inline-flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={brandOverlapHref(a, b, currentPage - 1)}
                  className="btn btn-xs"
                >
                  {t.brandOverlap.prevPage}
                </Link>
              ) : (
                <span className="btn btn-xs pointer-events-none opacity-40">{t.brandOverlap.prevPage}</span>
              )}
              {currentPage < totalPages ? (
                <Link
                  href={brandOverlapHref(a, b, currentPage + 1)}
                  className="btn btn-xs"
                >
                  {t.brandOverlap.nextPage}
                </Link>
              ) : (
                <span className="btn btn-xs pointer-events-none opacity-40">{t.brandOverlap.nextPage}</span>
              )}
            </div>
          </nav>
        )}
        </>
      )}
    </section>
  );
}
