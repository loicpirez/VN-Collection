import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mic, Users } from 'lucide-react';
import { searchStaff } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { languageDisplayName } from '@/lib/language-names';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; aliases?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const dict = await getDict();
  const { q } = await searchParams;
  return { title: q ? `${q} — ${dict.staffSearch.pageTitle}` : dict.staffSearch.pageTitle };
}

/**
 * VNDB-wide staff search. Until now you could land on `/staff/[id]`
 * via a credit link but couldn't search for staff by name without
 * leaving the app. This page surfaces the `searchStaff` helper that
 * already powered the modal picker. Toggling "include aliases" drops
 * the `ismain=1` gate so romaji / pen-name variants come back too.
 */
export default async function StaffSearchPage({ searchParams }: PageProps) {
  const t = await getDict();
  const { q, aliases } = await searchParams;
  const mainOnly = aliases !== '1';
  const query = (q ?? '').trim();
  const results = query
    ? await searchStaff(query, { results: 60, mainOnly }).catch(() => [])
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-accent" aria-hidden /> {t.staffSearch.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.staffSearch.pageSubtitle}</p>

        <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t.staffSearch.searchPlaceholder}
            aria-label={t.staffSearch.searchPlaceholder}
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          <label className="inline-flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              name="aliases"
              value="1"
              defaultChecked={!mainOnly}
              className="accent-accent"
            />
            {t.staffSearch.includeAliases}
          </label>
          <button type="submit" className="btn">
            {t.search.run}
          </button>
        </form>
      </header>

      {query.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.staffSearch.idleHint}
        </p>
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.staffSearch.empty}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {results.length} {t.staffSearch.resultsCount}
          </p>
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {results.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/staff/${s.id}`}
                  className="group block rounded-lg border border-border bg-bg-elev/40 p-3 transition-colors hover:border-accent"
                >
                  <p className="line-clamp-1 text-sm font-bold transition-colors group-hover:text-accent">
                    {s.name}
                  </p>
                  {s.original && (
                    <p className="line-clamp-1 text-xs text-muted">{s.original}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted/80">
                    {s.lang && <Chip>{languageDisplayName(s.lang)}</Chip>}
                    {s.gender && (
                      <Chip>
                        {s.gender === 'm' ? t.staff.genderM : s.gender === 'f' ? t.staff.genderF : s.gender}
                      </Chip>
                    )}
                    {!s.ismain && (
                      <Chip>
                        <Mic className="mr-0.5 inline h-2.5 w-2.5" aria-hidden /> {t.staffSearch.aliasChip}
                      </Chip>
                    )}
                  </div>
                  {s.aliases && s.aliases.length > 1 && (
                    <p className="mt-1 line-clamp-1 text-[10px] text-muted/70">
                      {t.common.aka} {s.aliases.slice(0, 3).map((a) => a.name).join(' · ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-bg-elev/60 px-1.5 py-0.5">
      {children}
    </span>
  );
}
