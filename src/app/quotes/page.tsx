import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Quote, Search } from 'lucide-react';
import { listAllQuotes } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.quotes };
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getDict();
  const items = listAllQuotes(q, 300);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 rounded-md border border-transparent text-sm text-muted hover:text-white md:mb-2 md:border-border md:bg-bg-elev/30 md:px-1.5 md:py-1 md:text-[11px] md:opacity-70 md:hover:border-accent md:hover:opacity-100">
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
            name="q"
            defaultValue={q ?? ''}
            placeholder={t.quotesPage.searchPlaceholder}
            className="input flex-1"
          />
        </form>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.quotesPage.empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={`${it.vn_id}:${it.quote_id}`}
              className="group rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
            >
              <blockquote className="whitespace-pre-wrap text-sm leading-relaxed text-white/90 before:mr-1 before:text-accent before:content-['“'] after:ml-1 after:text-accent after:content-['”']">
                {it.quote}
              </blockquote>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
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
                <span className="font-mono">{it.score}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
