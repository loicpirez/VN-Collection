import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mic, Users, X } from 'lucide-react';
import { searchStaff, type VndbStaff } from '@/lib/vndb';
import { searchLocalStaff } from '@/lib/db';
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
 * VNDB-wide staff search.
 *
 * Two new behaviours over the previous build:
 *
 *  - Empty-query + filters is a valid input. `?q=&role=translator&lang=ja`
 *    must return results because the operator may genuinely want to
 *    browse "every translator credited in Japanese on a VN I own"
 *    without typing a name. The page now triggers a fetch whenever a
 *    query OR a filter is present.
 *  - `scope=collection` flips the search to a pure local query
 *    against `vn_staff_credit` (joined with `collection`). `scope=all`
 *    keeps the original "local hits surface but VNDB drives the
 *    result list" behaviour.
 */
export default async function StaffSearchPage({ searchParams }: PageProps) {
  const t = await getDict();
  const sp = await searchParams;
  const parsed = parseStaffSearchParams(sp);
  const mainOnly = sp.aliases !== '1';
  const query = parsed.q;
  const { tab, role, lang, vn, scope } = parsed;
  const hasFilters = role != null || lang != null || vn != null;

  type StaffRow = {
    id: string;
    name: string;
    original: string | null;
    lang: string | null;
    gender?: string | null;
    ismain?: boolean;
    aliases?: { name: string }[];
    roles?: string[];
    vn_count?: number;
    source: 'local' | 'vndb';
  };

  // Always fetch local results — both scopes browse local data by default.
  const localRows: StaffRow[] = searchLocalStaff({
    q: query || undefined,
    role,
    lang,
    limit: 200,
  }).map((s) => ({ ...s, source: 'local' as const }));

  let results: StaffRow[] = [];
  if (scope === 'collection') {
    results = localRows;
  } else {
    // scope=all: VNDB + local, VNDB only when there's a text query.
    const vndbRows: StaffRow[] = query
      ? (
          await searchStaff(query, {
            results: 60,
            mainOnly,
            role: tab === 'vndb' ? role : null,
            lang,
            vn: tab === 'vndb' ? vn : null,
          }).catch(() => []) as VndbStaff[]
        ).map((s) => ({
          id: s.id,
          name: s.name,
          original: s.original,
          lang: s.lang,
          gender: s.gender,
          ismain: s.ismain,
          aliases: s.aliases?.map((a) => ({ name: a.name })),
          source: 'vndb' as const,
        }))
      : [];
    const merged = new Map<string, StaffRow>();
    for (const r of vndbRows) merged.set(r.id, r);
    for (const r of localRows) merged.set(r.id, r);
    results = [...merged.values()];
    if (lang) results = results.filter((s) => !s.lang || s.lang === lang);
  }
  // Show idle hint only when there are truly no results (VNDB-wide search with no local data)
  const shouldQuery = results.length > 0 || query.length > 0 || hasFilters || scope === 'collection';

  function chipHref(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (!mainOnly) params.set('aliases', '1');
    if (tab === 'vndb' && !('tab' in overrides)) params.set('tab', 'vndb');
    if (role && !('role' in overrides)) params.set('role', role);
    if (lang && !('lang' in overrides)) params.set('lang', lang);
    if (vn && !('vn' in overrides)) params.set('vn', vn);
    if (scope === 'collection' && !('scope' in overrides)) params.set('scope', 'collection');
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/staff?${qs}` : '/staff';
  }
  const staffRoles: readonly string[] = [
    'scenario',
    'chardesign',
    'art',
    'music',
    'songs',
    'director',
    'producer',
    'staff',
    'translator',
  ];
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
            className="input flex-1 min-w-[200px]"
          />
          {tab === 'vndb' && <input type="hidden" name="tab" value="vndb" />}
          {role && <input type="hidden" name="role" value={role} />}
          {lang && <input type="hidden" name="lang" value={lang} />}
          {vn && <input type="hidden" name="vn" value={vn} />}
          {scope === 'collection' && <input type="hidden" name="scope" value="collection" />}
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

        <div className="mt-3 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs" role="tablist" aria-label={t.staffSearch.scopeLabel}>
          <Link
            href={chipHref({ scope: null })}
            role="tab"
            aria-selected={scope === 'all'}
            className={`rounded px-2.5 py-1 ${scope === 'all' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.staffSearch.scopeAll}
          </Link>
          <Link
            href={chipHref({ scope: 'collection' })}
            role="tab"
            aria-selected={scope === 'collection'}
            className={`rounded px-2.5 py-1 ${scope === 'collection' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.staffSearch.scopeCollection}
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">{t.staffSearch.filtersLabel}:</span>
          {staffRoles.map((r) => (
            <Link
              key={r}
              href={chipHref({ role: role === r ? null : r })}
              className={role === r ? 'chip chip-active' : 'chip'}
              aria-pressed={role === r}
              title={t.staffSearch.roleLabels[r as keyof typeof t.staffSearch.roleLabels] ?? r}
            >
              {t.staffSearch.roleLabels[r as keyof typeof t.staffSearch.roleLabels] ?? r}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          {langs.map((l) => (
            <Link
              key={l}
              href={chipHref({ lang: lang === l ? null : l })}
              className={lang === l ? 'chip chip-active' : 'chip'}
              aria-pressed={lang === l}
              title={languageDisplayName(l)}
            >
              {languageDisplayName(l)}
            </Link>
          ))}
          {(role || lang || vn) && (
            <Link
              href={chipHref({ role: null, lang: null, vn: null })}
              className="chip"
              aria-label={t.staffSearch.resetFilters}
            >
              <X className="inline h-3 w-3" aria-hidden /> {t.staffSearch.resetFilters}
            </Link>
          )}
        </div>
      </header>

      {!shouldQuery ? (
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
                    {s.source === 'local' && s.vn_count != null && (
                      <Chip>
                        {t.staffSearch.localVnCount.replace('{n}', String(s.vn_count))}
                      </Chip>
                    )}
                    {s.roles && s.roles.length > 0 && (
                      <Chip>
                        {s.roles.slice(0, 2).join(', ')}
                      </Chip>
                    )}
                    {s.ismain === false && (
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
