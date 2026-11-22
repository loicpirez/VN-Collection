'use client';
import { memo, useMemo } from 'react';
import { GitMerge } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { useT } from '@/lib/i18n/client';
import { useSectionCount } from './vn-detail/DetailSectionFrame';
import { WorksScopeCount, WorksScopeGrid, WorksScopeLink, WorksScopeProvider, WorksScopeSection } from './WorksScope';
import type { WorksScope } from '@/lib/works-scope';
import type { LocalPlaytimeSources, VnRelation } from '@/lib/types';

const RELATION_ORDER: Record<string, number> = {
  seq: 0,
  preq: 1,
  par: 2,
  fan: 3,
  alt: 4,
  ser: 5,
  set: 6,
  char: 7,
  side: 8,
  orig: 9,
};

/** Related VN card with membership and local sources for the automatic duration median. */
export interface EnrichedRelation extends VnRelation, LocalPlaytimeSources {
  in_collection: boolean;
  sold?: boolean;
}

// WeakMap-cached projection so the same row always yields the same
// `CardData` reference - keeps `React.memo(VnCard)` from re-rendering
// every card when the section's open/close state toggles.
const relationCache = new WeakMap<EnrichedRelation, CardData>();

function relationCardData(r: EnrichedRelation): CardData {
  const cached = relationCache.get(r);
  if (cached) return cached;
  const data: CardData = {
    id: r.id,
    title: r.title,
    poster: r.image_url || r.image_thumb,
    sexual: r.image_sexual,
    released: r.released,
    rating: r.rating,
    length_minutes: r.length_minutes,
    playtime_minutes: r.playtime_minutes,
    egs_playtime_minutes: r.egs_playtime_minutes,
    ai_playtime_minutes: r.ai_playtime_minutes,
    developers: r.developers,
    publishers: r.publishers ?? [],
    inCollectionBadge: r.in_collection,
    ...(r.sold ? { status: 'sold' as const } : {}),
  };
  relationCache.set(r, data);
  return data;
}

/**
 * Memoized wrapper that stabilises the `badge` prop reference so
 * `React.memo(VnCard)` doesn't re-render when the parent section
 * toggles open/closed without changing any relation data.
 */
const RelationCard = memo(function RelationCard({
  r,
  label,
  unofficial,
}: {
  r: EnrichedRelation;
  label: string;
  unofficial: string;
}) {
  const badge = useMemo(
    () => ({
      label: r.relation_official ? label : `${label} / ${unofficial}`,
      tone: (r.relation_official ? 'accent' : 'muted') as 'accent' | 'muted',
    }),
    [r.relation_official, label, unofficial],
  );
  return <VnCard badge={badge} data={relationCardData(r)} />;
});

interface Props {
  relations: EnrichedRelation[];
  initialScope?: WorksScope;
}

export function RelationsSection({ relations, initialScope = 'all' }: Props) {
  const t = useT();

  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedRelation[]>();
    for (const rel of relations) {
      const list = map.get(rel.relation) ?? [];
      list.push(rel);
      map.set(rel.relation, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) => (RELATION_ORDER[a[0]] ?? 99) - (RELATION_ORDER[b[0]] ?? 99),
    );
  }, [relations]);

  useSectionCount(relations.length > 0 ? relations.length : null);

  if (relations.length === 0) return null;
  const activeCount = relations.filter((relation) => relation.in_collection).length;
  const soldCount = relations.filter((relation) => relation.sold).length;

  return (
    <WorksScopeProvider initialScope={initialScope}>
      <div className="space-y-6 px-6 py-5">
        <nav className="flex flex-wrap gap-1.5" aria-label={t.producerVns.scopeLabel}>
          <WorksScopeLink scope="all" href="?#section-relations">{t.library.all}</WorksScopeLink>
          <WorksScopeLink scope="collection" href="?scope=collection#section-relations">{t.library.filterMine}</WorksScopeLink>
          <WorksScopeLink scope="sold" href="?scope=sold#section-relations">{t.status.sold}</WorksScopeLink>
        </nav>
        <WorksScopeCount all={relations.length} owned={activeCount} sold={soldCount}
          empty={<p className="text-sm text-muted">{t.search.noResults}</p>} />
        {grouped.map(([relation, rels]) => {
          const label = t.relations.types[relation as keyof typeof t.relations.types] ?? relation;
          const owned = rels.map((r) => r.in_collection);
          const sold = rels.map((r) => !!r.sold);
          const ownedCount = owned.filter(Boolean).length;
          const groupSoldCount = sold.filter(Boolean).length;
          return (
            <WorksScopeSection key={relation} ownedCount={ownedCount} soldCount={groupSoldCount}>
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                  <GitMerge className="h-3 w-3 text-accent" aria-hidden />
                  {label}
                  <span className="opacity-70">/ <WorksScopeCount all={rels.length} owned={ownedCount} sold={groupSoldCount} /></span>
                </h3>
                <WorksScopeGrid
                  owned={owned}
                  sold={sold}
                  ariaLabel={t.relations.paginationLabel.replace('{group}', label)}
                  resetKey={`relations:${relation}:${rels.length}:${rels[0].id}:${rels[rels.length - 1].id}`}
                  className="grid items-stretch gap-4"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
                  pageSize={12}
                >
                  {rels.map((r) => (
                    <li key={`${r.id}-${r.relation}`} className="flex min-h-0 min-w-0 flex-col items-stretch self-stretch">
                      <RelationCard r={r} label={label} unofficial={t.relations.unofficial} />
                    </li>
                  ))}
                </WorksScopeGrid>
              </section>
            </WorksScopeSection>
          );
        })}
      </div>
    </WorksScopeProvider>
  );
}
