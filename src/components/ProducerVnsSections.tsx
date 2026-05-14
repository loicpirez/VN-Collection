import Link from 'next/link';
import { AlertTriangle, Check, Package, Wrench } from 'lucide-react';
import { fetchProducerAssociations, type ProducerAssociations, type ProducerVnRef } from '@/lib/producer-associations';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from './SafeImage';
import { AddMissingVnButton } from './AddMissingVnButton';
import { ProducerRefreshButton } from './ProducerRefreshButton';

/**
 * Renders BOTH "developed by" and "published by" credits for a producer
 * in two distinct sections. The two roles are semantically different
 * (the same studio may produce a VN, publish it, or do both) so we
 * keep them visually separated and never collapse them into one list.
 *
 * Each section lists every VN known to VNDB for that role, ordered
 * newest-first. Rows the user already owns get a check badge; rows
 * they don't own get an inline "+" affordance to add it as planning.
 *
 * When VNDB is unreachable AND nothing is cached, both arrays come
 * back empty and the component renders only the refresh button + an
 * empty-state hint, so the page still has the producer header.
 */
export async function ProducerVnsSections({ producerId }: { producerId: string }) {
  const t = await getDict();
  let data: ProducerAssociations;
  try {
    data = await fetchProducerAssociations(producerId);
  } catch {
    data = {
      name: null,
      developerVns: [],
      publisherVns: [],
      totalUnique: 0,
      ownedUnique: 0,
      fromCache: false,
      upstreamFailed: true,
      stale: false,
    };
  }

  const totalCount = data.developerVns.length + data.publisherVns.length;
  const ownedTotal =
    data.developerVns.filter((v) => v.owned).length + data.publisherVns.filter((v) => v.owned).length;

  return (
    <section className="mb-8 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold">{t.producerVns.heading}</h2>
          <p className="text-xs text-muted">
            {t.producerVns.summary
              .replace('{owned}', String(ownedTotal))
              .replace('{total}', String(totalCount))
              .replace('{devs}', String(data.developerVns.length))
              .replace('{pubs}', String(data.publisherVns.length))}
          </p>
          {/*
            Stale badge: rendered when at least one paginated walk
            fell back to the cache because the live VNDB call threw.
            The counts above can still be wrong, so we flag it
            visually next to the summary line. The refresh button
            below is the user's only recourse — clicking it busts
            the cache and re-tries upstream.
          */}
          {data.stale && (
            <span
              className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-status-on_hold/50 bg-status-on_hold/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-on_hold"
              title={t.producerVns.staleSuffix}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t.producerVns.staleBadge}
            </span>
          )}
        </div>
        <ProducerRefreshButton producerId={producerId} />
      </div>

      {/*
        Hide an empty role section when the other side has data — a
        publisher-only studio shouldn't ship a heavy "As developer"
        empty frame, and vice versa. When BOTH are empty we still
        render the developer section as a single empty state so the
        page isn't completely blank.
      */}
      {(data.developerVns.length > 0 ||
        (data.developerVns.length === 0 && data.publisherVns.length === 0)) && (
        <RoleSection
          title={t.producerVns.developerCredits}
          emptyMessage={t.producerVns.noDeveloper}
          icon="dev"
          vns={data.developerVns}
          t={t}
        />
      )}

      {data.publisherVns.length > 0 && (
        <RoleSection
          title={t.producerVns.publisherCredits}
          emptyMessage={t.producerVns.noPublisher}
          icon="pub"
          vns={data.publisherVns}
          t={t}
        />
      )}
    </section>
  );
}

function RoleSection({
  title,
  emptyMessage,
  icon,
  vns,
  t,
}: {
  title: string;
  emptyMessage: string;
  icon: 'dev' | 'pub';
  vns: ProducerVnRef[];
  t: Awaited<ReturnType<typeof getDict>>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
          {icon === 'dev' ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          {title}
        </h3>
        <span className="text-xs text-muted">
          <span className="font-bold text-accent">
            {vns.filter((v) => v.owned).length}/{vns.length}
          </span>{' '}
          {t.producerVns.ownedLabel}
        </span>
      </div>

      {vns.length === 0 ? (
        <p className="text-xs text-muted/80">{emptyMessage}</p>
      ) : (
        <ul className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {vns.map((v) => (
            <li key={v.id} className="relative">
              <Link
                href={`/vn/${v.id}`}
                className="group flex gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 pr-10 transition-colors hover:border-accent"
              >
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded">
                  <SafeImage
                    src={v.image?.thumbnail || v.image?.url || null}
                    sexual={v.image?.sexual ?? null}
                    alt={v.title}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                    {v.title}
                  </h4>
                  {v.alttitle && v.alttitle !== v.title && (
                    <p className="line-clamp-1 text-[10px] text-muted/80">{v.alttitle}</p>
                  )}
                  <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                    {v.released?.slice(0, 4) && <span>{v.released.slice(0, 4)}</span>}
                    {v.rating != null && <span className="text-accent">★ {(v.rating / 10).toFixed(1)}</span>}
                  </p>
                </div>
              </Link>
              <div className="absolute right-2 top-2">
                {v.owned ? (
                  <span
                    aria-label={t.producerVns.ownedLabel}
                    title={t.producerVns.ownedLabel}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-md border border-status-completed/60 bg-status-completed/15 text-status-completed"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <AddMissingVnButton vnId={v.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
