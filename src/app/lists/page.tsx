import type { Metadata } from 'next';
import Link from 'next/link';
import { ListChecks, Pin } from 'lucide-react';
import { listUserLists } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { CreateListForm } from '@/components/CreateListForm';
import { ListCardActions } from '@/components/ListCardActions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.lists.pageTitle };
}

export default async function ListsPage() {
  const t = await getDict();
  const lists = listUserLists();

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <ListChecks className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.lists.pageTitle}</h1>
          <p className="text-sm text-muted">{t.lists.pageSubtitle}</p>
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <CreateListForm />
      </section>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {t.lists.empty}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <li
              key={list.id}
              className="group relative rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent/60"
            >
              <Link href={`/lists/${list.id}`} className="block">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: list.color ?? '#475569' }}
                    aria-hidden
                  >
                    <ListChecks className="h-4 w-4" />
                  </span>
                  <h2 className="line-clamp-1 flex-1 text-base font-bold">{list.name}</h2>
                  {!!list.pinned && <Pin className="h-3.5 w-3.5 text-accent" aria-hidden />}
                </div>
                {list.description && (
                  <p className="line-clamp-2 text-xs text-muted">{list.description}</p>
                )}
                <div className="mt-3 text-[11px] uppercase tracking-wider text-muted">
                  {(list.vn_count === 1 ? t.lists.vnCountSingular : t.lists.vnCount).replace('{n}', String(list.vn_count))}
                </div>
              </Link>
              <ListCardActions list={list} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
