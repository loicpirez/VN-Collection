import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, Filter, Search } from 'lucide-react';
import { listActivityKinds, listUserActivity } from '@/lib/activity';
import { getDict, getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.userActivity.title };
}

export default async function ActivityPage({ searchParams }: PageProps) {
  const t = await getDict();
  const locale = await getLocale();
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const kind = first(sp.kind).trim();
  const entity = first(sp.entity).trim();
  const kinds = listActivityKinds();
  const rows = listUserActivity({ q: q || null, kind: kind || null, entity: entity || null, limit: 200 });
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Activity className="h-6 w-6 text-accent" aria-hidden /> {t.userActivity.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.userActivity.subtitle}</p>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-xs text-muted">
            <span className="mb-1 inline-flex items-center gap-1">
              <Search className="h-3 w-3" aria-hidden /> {t.userActivity.search}
            </span>
            <input
              name="q"
              defaultValue={q}
              className="block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="min-w-[160px] text-xs text-muted">
            <span className="mb-1 inline-flex items-center gap-1">
              <Filter className="h-3 w-3" aria-hidden /> {t.userActivity.kind}
            </span>
            <select
              name="kind"
              defaultValue={kind}
              className="block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white"
            >
              <option value="">{t.common.none}</option>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="min-w-[160px] text-xs text-muted">
            <span className="mb-1 block">{t.userActivity.entity}</span>
            <input
              name="entity"
              defaultValue={entity}
              className="block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white"
            />
          </label>
          <button type="submit" className="btn btn-primary">{t.search.run}</button>
          {(q || kind || entity) && <Link href="/activity" className="btn">{t.cardDensity.resetView}</Link>}
        </form>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">{t.userActivity.empty}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{row.label || row.kind}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {row.kind}
                    {row.entity && <> · {row.entity}{row.entity_id ? `:${row.entity_id}` : ''}</>}
                  </p>
                </div>
                <time className="text-[11px] text-muted" dateTime={new Date(row.occurred_at).toISOString()}>
                  {fmt.format(new Date(row.occurred_at))}
                </time>
              </div>
              {row.payload && (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-bg-elev/40 p-2 text-[11px] text-muted">
                  {JSON.stringify(JSON.parse(row.payload), null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
