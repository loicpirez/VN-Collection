import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Quote, Search } from 'lucide-react';
import { listAllQuotes } from '@/lib/db';
import { QuoteAvatar } from '@/components/QuoteAvatar';
import { getDict } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.quotes };
}

const PAGE_SIZE = 50;

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const t = await getDict();
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const fetched = listAllQuotes(q, PAGE_SIZE + 1, offset);
  const hasNext = fetched.length > PAGE_SIZE;
  const items = hasNext ? fetched.slice(0, PAGE_SIZE) : fetched;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/quotes${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="w-full">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Quote className="h-6 w-6 text-accent" /> {t.quotesPage.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.quotesPage.subtitle}</p>
        <form action="/quotes" className="mt-3 flex max-w-md items-center gap-2">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            type="search"
            inputMode="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t.quotesPage.searchPlaceholder}
            aria-label={t.quotesPage.searchPlaceholder}
            className="input flex-1"
          />
        </form>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-6 text-center text-sm text-muted">
          <Quote className="mx-auto mb-3 h-6 w-6 text-accent" aria-hidden />
          <p>{t.quotesPage.empty}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={`${it.vn_id}:${it.quote_id}`}
                className="group rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
              >
                <blockquote className={'whitespace-pre-wrap text-sm leading-relaxed text-white/90 before:mr-1 before:text-accent before:content-[\'"\'] after:ml-1 after:text-accent after:content-[\'"\']'}>
                  {it.quote}
                </blockquote>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  {/*
                    Avatar + linked character name on the left side of
                    the citation row. The `QuoteAvatar` falls back to a
                    `<UserCircle>` icon when no local portrait is
                    mirrored, so we always render the row at the same
                    height even when `character_local_image` is null.
                  */}
                  <span className="inline-flex items-center gap-2">
                    <QuoteAvatar quote={it} size={28} />
                    <span>
                      {it.character_name && it.character_id ? (
                        <Link
                          href={`/character/${it.character_id}`}
                          className="font-semibold text-white/85 hover:text-accent"
                        >
                          {it.character_name}
                        </Link>
                      ) : it.character_name ? (
                        <span className="font-semibold text-white/85">{it.character_name}</span>
                      ) : null}
                      {it.character_name && ' · '}
                      <Link href={`/vn/${it.vn_id}`} className="hover:text-accent">{it.vn_title}</Link>
                    </span>
                  </span>
                  <span className="font-mono">{it.score}</span>
                </div>
              </li>
            ))}
          </ul>

          {(page > 1 || hasNext) && (
            <nav className="mt-6 flex items-center justify-between gap-4" aria-label={t.quotesPage.pageIndicator.replace('{page}', String(page))}>
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn btn-xs inline-flex items-center gap-1">
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t.quotesPage.prevPage}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted">
                {t.quotesPage.pageIndicator.replace('{page}', String(page))}
              </span>
              {hasNext ? (
                <Link href={pageHref(page + 1)} className="btn btn-xs inline-flex items-center gap-1">
                  {t.quotesPage.nextPage}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
