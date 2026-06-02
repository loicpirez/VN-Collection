'use client';
import { memo, useMemo } from 'react';
import { GitMerge } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { useT } from '@/lib/i18n/client';
import { useSectionCount } from './vn-detail/DetailSectionFrame';
import type { VnRelation } from '@/lib/types';

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

export interface EnrichedRelation extends VnRelation {
  in_collection: boolean;
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
    developers: r.developers,
    publishers: r.publishers ?? [],
    inCollectionBadge: r.in_collection,
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
}

export function RelationsSection({ relations }: Props) {
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

  return (
    <div className="space-y-6 px-6 py-5">
      {grouped.map(([relation, rels]) => {
        const label = t.relations.types[relation as keyof typeof t.relations.types] ?? relation;
        return (
          <section key={relation}>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              <GitMerge className="h-3 w-3 text-accent" aria-hidden />
              {label}
              <span className="opacity-70">/ {rels.length}</span>
            </h3>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
            >
              {rels.map((r) => (
                <RelationCard
                  key={`${r.id}-${r.relation}`}
                  r={r}
                  label={label}
                  unofficial={t.relations.unofficial}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
