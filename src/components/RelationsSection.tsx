'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitMerge } from 'lucide-react';
import { VnCard } from './VnCard';
import { useT } from '@/lib/i18n/client';
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

interface Props {
  relations: EnrichedRelation[];
}

export function RelationsSection({ relations }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

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

  if (relations.length === 0) return null;

  return (
    <details
      className="group rounded-xl border border-border bg-bg-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 hover:bg-bg-elev/50">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <GitMerge className="h-4 w-4 text-accent" /> {t.relations.section}
          <span className="text-[11px] font-normal text-muted">· {relations.length}</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </summary>
      <div className="space-y-6 border-t border-border px-6 py-5">
        {grouped.map(([relation, rels]) => {
          const label = t.relations.types[relation as keyof typeof t.relations.types] ?? relation;
          return (
            <section key={relation}>
              <h4 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                <GitMerge className="h-3 w-3 text-accent" aria-hidden />
                {label}
                <span className="opacity-70">· {rels.length}</span>
              </h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {rels.map((r) => (
                  <VnCard
                    key={`${r.id}-${r.relation}`}
                    badge={{
                      label: r.relation_official ? label : `${label} · ${t.relations.unofficial}`,
                      tone: r.relation_official ? 'accent' : 'muted',
                    }}
                    data={{
                      id: r.id,
                      title: r.title,
                      // Prefer the full-res image_url over the 256px
                      // image_thumb so cards in this grid stay sharp at
                      // the 200+px display width. SafeImage handles its
                      // own decoding cost; the thumb fallback only fires
                      // when image_url is missing.
                      poster: r.image_url || r.image_thumb,
                      sexual: r.image_sexual,
                      released: r.released,
                      rating: r.rating,
                      length_minutes: r.length_minutes,
                      developers: r.developers,
                      inCollectionBadge: r.in_collection,
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}
