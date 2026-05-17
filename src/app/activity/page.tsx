import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, Filter, Search } from 'lucide-react';
import { listActivityKinds, listUserActivity } from '@/lib/activity';
import { listRecentActivity, type RecentActivityEntry } from '@/lib/db';
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

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function VnActivitySummary({
  entry,
  t,
  statusLabels,
}: {
  entry: RecentActivityEntry;
  t: Awaited<ReturnType<typeof getDict>>;
  statusLabels: Record<string, string>;
}) {
  const p = entry.payload as Record<string, unknown> | null;
  const ta = t.userActivity;

  switch (entry.kind) {
    case 'status': {
      const from = p?.from as string | null;
      const to = p?.to as string | null;
      const fromLabel = from ? (statusLabels[from] ?? from) : '—';
      const toLabel = to ? (statusLabels[to] ?? to) : '—';
      return (
        <span>
          <span className="text-muted">{fromLabel}</span>
          {' → '}
          <span className="font-semibold text-accent">{toLabel}</span>
        </span>
      );
    }
    case 'rating': {
      const from = p?.from as number | null;
      const to = p?.to as number | null;
      const fromStr = from != null ? String(from) : '—';
      const toStr = to != null ? String(to) : '—';
      return (
        <span>
          <span className="text-muted">{fromStr}</span>
          {' → '}
          <span className="font-semibold text-accent">{toStr}</span>
        </span>
      );
    }
    case 'playtime': {
      const from = p?.from as number ?? 0;
      const to = p?.to as number ?? 0;
      const delta = p?.delta as number ?? (to - from);
      return (
        <span>
          {formatMinutes(to)}
          {delta !== 0 && (
            <span className={`ml-1.5 text-[10px] ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}{ta.playtimeDelta} {formatMinutes(Math.abs(delta))}
            </span>
          )}
        </span>
      );
    }
    case 'favorite': {
      const on = !!(p?.to);
      return <span className={on ? 'text-yellow-400' : 'text-muted'}>{on ? ta.favOn : ta.favOff}</span>;
    }
    case 'started': {
      const to = p?.to as string | null;
      return <span className="text-accent">{to ?? '—'}</span>;
    }
    case 'finished': {
      const to = p?.to as string | null;
      return <span className="text-accent">{to ?? '—'}</span>;
    }
    case 'note': {
      const len = p?.length as number ?? 0;
      return <span className="text-muted">{len} {ta.noteChars}</span>;
    }
    case 'manual': {
      const text = p?.text as string | undefined;
      if (!text) return null;
      return (
        <span className="line-clamp-2 text-muted">{text}</span>
      );
    }
    default:
      return null;
  }
}

function kindLabel(kind: RecentActivityEntry['kind'], t: Awaited<ReturnType<typeof getDict>>): string {
  const ta = t.userActivity;
  switch (kind) {
    case 'status':   return ta.kindStatus;
    case 'rating':   return ta.kindRating;
    case 'playtime': return ta.kindPlaytime;
    case 'favorite': return ta.kindFavorite;
    case 'started':  return ta.kindStarted;
    case 'finished': return ta.kindFinished;
    case 'note':     return ta.kindNote;
    case 'manual':   return ta.kindManual;
    default:         return kind;
  }
}

const KIND_COLOR: Record<string, string> = {
  status:   'bg-blue-500/20 text-blue-300',
  rating:   'bg-yellow-500/20 text-yellow-300',
  playtime: 'bg-green-500/20 text-green-300',
  favorite: 'bg-pink-500/20 text-pink-300',
  started:  'bg-teal-500/20 text-teal-300',
  finished: 'bg-purple-500/20 text-purple-300',
  note:     'bg-slate-500/20 text-slate-300',
  manual:   'bg-accent/20 text-accent',
};

const PAGE_SIZE = 50;

function entityHref(entity: string | null, entityId: string | null): string | null {
  if (!entity || !entityId) return null;
  switch (entity) {
    case 'vn': return `/vn/${entityId}`;
    case 'producer': return `/producer/${entityId}`;
    case 'character': return `/character/${entityId}`;
    case 'staff': return `/staff/${entityId}`;
    case 'series': return `/series/${entityId}`;
    case 'tag': return `/tag/${entityId}`;
    case 'trait': return `/trait/${entityId}`;
    default: return null;
  }
}

export default async function ActivityPage({ searchParams }: PageProps) {
  const t = await getDict();
  const locale = await getLocale();
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const kind = first(sp.kind).trim();
  const entity = first(sp.entity).trim();
  const page = Math.max(0, parseInt(first(sp.page) || '0', 10));
  const offset = page * PAGE_SIZE;

  const kinds = listActivityKinds();
  const sysRowsAll = listUserActivity({ q: q || null, kind: kind || null, entity: entity || null, limit: offset + PAGE_SIZE + 1 });
  const sysRows = sysRowsAll.slice(offset, offset + PAGE_SIZE);
  const sysHasMore = sysRowsAll.length > PAGE_SIZE;

  const vnRowsAll = listRecentActivity(offset + PAGE_SIZE + 1);
  const vnRows = vnRowsAll.slice(offset, offset + PAGE_SIZE);
  const vnHasMore = vnRowsAll.length > PAGE_SIZE;

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const statusLabels = t.status as Record<string, string>;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    if (entity) params.set('entity', entity);
    if (p > 0) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `/activity?${qs}` : '/activity';
  }

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
              className="input w-full"
            />
          </label>
          <label className="min-w-[160px] text-xs text-muted">
            <span className="mb-1 inline-flex items-center gap-1">
              <Filter className="h-3 w-3" aria-hidden /> {t.userActivity.kind}
            </span>
            <select name="kind" defaultValue={kind} className="input w-full">
              <option value="">{t.userActivity.allKinds}</option>
              {kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="min-w-[160px] text-xs text-muted">
            <span className="mb-1 block">{t.userActivity.entity}</span>
            <input name="entity" defaultValue={entity} className="input w-full" />
          </label>
          <button type="submit" className="btn btn-primary">{t.search.run}</button>
          {(q || kind || entity) && <Link href="/activity" className="btn">{t.cardDensity.resetView}</Link>}
        </form>
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t.userActivity.vnChanges}</h2>
          {vnRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted">{t.userActivity.empty}</p>
          ) : (
            <>
              <ol className="space-y-2">
                {vnRows.map((row) => (
                  <li key={row.id} className="rounded-xl border border-border bg-bg-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_COLOR[row.kind] ?? 'bg-muted/20 text-muted'}`}>
                            {kindLabel(row.kind, t)}
                          </span>
                          <Link
                            href={`/vn/${row.vn_id}`}
                            className="truncate text-sm font-semibold hover:text-accent transition-colors"
                          >
                            {row.title}
                          </Link>
                        </div>
                        <div className="mt-1 text-xs">
                          <VnActivitySummary entry={row} t={t} statusLabels={statusLabels} />
                        </div>
                      </div>
                      <time className="shrink-0 text-[11px] text-muted" dateTime={new Date(row.occurred_at).toISOString()}>
                        {fmt.format(new Date(row.occurred_at))}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
              <Pagination page={page} hasMore={vnHasMore} pageHref={pageHref} t={t} />
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t.userActivity.sysEvents}</h2>
          {sysRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted">{t.userActivity.empty}</p>
          ) : (
            <>
              <ol className="space-y-2">
                {sysRows.map((row) => {
                  const href = entityHref(row.entity, row.entity_id);
                  return (
                    <li key={row.id} className="rounded-xl border border-border bg-bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{row.label || row.kind.replace(/_/g, ' ')}</p>
                          {(row.entity || row.entity_id) && (
                            <p className="mt-0.5 text-[11px] text-muted">
                              {href ? (
                                <Link href={href} className="hover:text-accent transition-colors">
                                  {row.entity}{row.entity_id ? ` · ${row.entity_id}` : ''}
                                </Link>
                              ) : (
                                <span>{row.entity}{row.entity_id ? ` · ${row.entity_id}` : ''}</span>
                              )}
                            </p>
                          )}
                        </div>
                        <time className="text-[11px] text-muted" dateTime={new Date(row.occurred_at).toISOString()}>
                          {fmt.format(new Date(row.occurred_at))}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <Pagination page={page} hasMore={sysHasMore} pageHref={pageHref} t={t} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Pagination({
  page,
  hasMore,
  pageHref,
  t,
}: {
  page: number;
  hasMore: boolean;
  pageHref: (p: number) => string;
  t: Awaited<ReturnType<typeof getDict>>;
}) {
  if (page === 0 && !hasMore) return null;
  return (
    <nav className="mt-4 flex items-center gap-2 text-xs">
      {page > 0 && (
        <Link href={pageHref(page - 1)} className="btn">
          ← {t.common.prev}
        </Link>
      )}
      <span className="text-muted">{t.userActivity.pageLabel.replace('{n}', String(page + 1))}</span>
      {hasMore && (
        <Link href={pageHref(page + 1)} className="btn">
          {t.common.next} →
        </Link>
      )}
    </nav>
  );
}
