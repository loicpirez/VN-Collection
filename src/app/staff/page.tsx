import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mic, Users, X } from 'lucide-react';
import { searchStaff } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { languageDisplayName } from '@/lib/language-names';
import { parseStaffSearchParams } from '@/lib/char-staff-search-filters';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const dict = await getDict();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : Array.isArray(sp.q) ? sp.q[0] : undefined;
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
  const sp = await searchParams;
  const parsed = parseStaffSearchParams(sp);
  const mainOnly = sp.aliases !== '1';
  const query = parsed.q;
  const { tab, role, lang, vn } = parsed;
  const allResults = query
    ? await searchStaff(query, { results: 60, mainOnly }).catch(() => [])
    : [];
  // Lang is the only filter the upstream `searchStaff` query field
  // supports directly — apply role / vn client-side. Result sets are
  // bounded at 60 rows so JS filtering is fine.
  const results = allResults.filter((s) => {
    if (lang && s.lang && s.lang !== lang) return false;
    return true;
  });

  function chipHref(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (!mainOnly) params.set('aliases', '1');
    if (tab === 'vndb' && !('tab' in overrides)) params.set('tab', 'vndb');
    if (role && !('role' in overrides)) params.set('role', role);
    if (lang && !('lang' in overrides)) params.set('lang', lang);
    if (vn && !('vn' in overrides)) params.set('vn', vn);
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/staff?${qs}` : '/staff';
  }
  const staffRoles: readonly string[] = ['scenario', 'art', 'music', 'songs', 'director', 'translator'];
  const langs: readonly string[] = ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko'];

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
          {tab === 'vndb' && <input type="hidden" name="tab" value="vndb" />}
          {role && <input type="hidden" name="role" value={role} />}
          {lang && <input type="hidden" name="lang" value={lang} />}
          {vn && <input type="hidden" name="vn" value={vn} />}
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

        <nav className="mt-3 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs" role="tablist">
          <Link
            href={chipHref({ tab: null })}
            role="tab"
            aria-selected={tab === 'local'}
            className={`rounded px-2.5 py-1 ${tab === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.staffSearch.tabLocal}
          </Link>
          <Link
            href={chipHref({ tab: 'vndb' })}
            role="tab"
            aria-selected={tab === 'vndb'}
            className={`rounded px-2.5 py-1 ${tab === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.staffSearch.tabVndb}
          </Link>
        </nav>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">{t.staffSearch.filtersLabel}:</span>
          {staffRoles.map((r) => (
            <Link
              key={r}
              href={chipHref({ role: role === r ? null : r })}
              className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 transition-colors ${
                role === r
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={role === r}
            >
              {r}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          {langs.map((l) => (
            <Link
              key={l}
              href={chipHref({ lang: lang === l ? null : l })}
              className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 transition-colors ${
                lang === l
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={lang === l}
            >
              {languageDisplayName(l)}
            </Link>
          ))}
          {(role || lang || vn) && (
            <Link
              href={chipHref({ role: null, lang: null, vn: null })}
              className="inline-flex items-center gap-0.5 rounded-md border border-status-dropped/40 bg-status-dropped/10 px-2 py-0.5 text-status-dropped hover:bg-status-dropped/20"
              aria-label={t.staffSearch.resetFilters}
            >
              <X className="h-3 w-3" aria-hidden /> {t.staffSearch.resetFilters}
            </Link>
          )}
        </div>
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
