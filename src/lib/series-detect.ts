import 'server-only';
import { db } from './db';

export interface SeriesSuggestion {
  /** Existing series to join, when at least one related VN already belongs to one. */
  existing: { id: number; name: string }[];
  /** Suggested name for a new series, derived from the shared title prefix. */
  suggestedName: string | null;
  /** VN ids the user owns that share a `seq` / `preq` / `set` / `fan` relation with the seed. */
  relatedInCollection: { id: string; title: string; relation: string }[];
}

interface VnRelationRow {
  id: string;
  title: string;
  relation: string;
}

const SERIES_RELATIONS = new Set(['seq', 'preq', 'set', 'fan', 'alt', 'orig']);

/**
 * BFS through VN relations starting from `seedVnId`, following only
 * series-strength relations (`seq` / `preq` / `set` / `fan` / `alt` / `orig`).
 * Returns every reachable VN we have a `vn` row for, in discovery order.
 *
 * VNDB stores relations per-VN one hop deep; "Ai Kiss 1" doesn't directly
 * list "Ai Kiss 3", but "Ai Kiss 2" links both. Walking transitively
 * surfaces the full chain so the series picker can offer the whole family.
 *
 * Excludes the seed itself from the returned list.
 */
export function walkSeriesRelations(seedVnId: string): { id: string; title: string; relation: string }[] {
  const visited = new Set<string>([seedVnId]);
  const out: { id: string; title: string; relation: string }[] = [];
  const queue: string[] = [seedVnId];
  const stmt = db.prepare('SELECT relations FROM vn WHERE id = ?');
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const row = stmt.get(current) as { relations: string | null } | undefined;
    if (!row?.relations) continue;
    let rels: VnRelationRow[];
    try {
      rels = JSON.parse(row.relations) as VnRelationRow[];
    } catch {
      continue;
    }
    for (const rel of rels) {
      if (!rel?.id || visited.has(rel.id) || !SERIES_RELATIONS.has(rel.relation)) continue;
      visited.add(rel.id);
      out.push({ id: rel.id, title: rel.title, relation: rel.relation });
      queue.push(rel.id);
    }
  }
  return out;
}

/** Strip trailing tokens like `2`, `II`, `: subtitle`, `~side~` to derive a series root. */
function trimVolumeMarker(s: string): string {
  return s
    .replace(/[:：][\s\S]*$/u, '')
    .replace(/[～~\-—][\s\S]*[～~]?$/u, '')
    .replace(/\s+(?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|[IVX]+|\d+)\s*$/u, '')
    .trim();
}

function longestCommonPrefix(titles: string[]): string {
  if (titles.length === 0) return '';
  let prefix = titles[0];
  for (let i = 1; i < titles.length; i++) {
    while (titles[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix.trim().replace(/[\s:：~～\-—]+$/u, '').trim();
}

/**
 * Inspect a VN's VNDB relations and the user's collection to propose
 * series membership. Returns nothing when there's no signal — caller
 * should hide the suggestion card.
 *
 * Rules:
 *   - Only relations in SERIES_RELATIONS are considered (seq, preq, set, …).
 *     `char` / `side` / `par` etc. are too weak to imply a series.
 *   - "Existing series": any series that already contains at least one
 *     related VN. The user can join the seed VN with one click.
 *   - "Suggested new series": the longest common prefix of the seed +
 *     the in-collection related titles, falling back to a trimmed seed
 *     title if no common prefix emerges.
 */
export function detectSeriesForVn(vnId: string): SeriesSuggestion | null {
  const seedRow = db.prepare(`SELECT title FROM vn WHERE id = ?`).get(vnId) as
    | { title: string }
    | undefined;
  if (!seedRow) return null;

  // Walk the full relation graph transitively — a VN's `relations` field only
  // names its direct neighbours, but a series often has 3+ entries where the
  // outer ones don't reference each other. BFS unifies the chain.
  const relations = walkSeriesRelations(vnId);
  if (relations.length === 0) return null;

  // Which related VNs does the user own?
  const placeholders = relations.map(() => '?').join(', ');
  const ownedRows = db
    .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${placeholders})`)
    .all(...relations.map((r) => r.id)) as { vn_id: string }[];
  const ownedIds = new Set(ownedRows.map((r) => r.vn_id));
  const relatedInCollection = relations.filter((r) => ownedIds.has(r.id));

  // If the seed itself is already part of a series, no suggestion needed.
  const seedSeries = db
    .prepare(`SELECT series_id FROM series_vn WHERE vn_id = ?`)
    .all(vnId) as { series_id: number }[];
  if (seedSeries.length > 0) return null;

  // Find existing series that contain any related VN.
  let existing: { id: number; name: string }[] = [];
  if (relatedInCollection.length > 0) {
    const placeholders2 = relatedInCollection.map(() => '?').join(', ');
    existing = db
      .prepare(`
        SELECT DISTINCT s.id, s.name FROM series s
        JOIN series_vn sv ON sv.series_id = s.id
        WHERE sv.vn_id IN (${placeholders2})
      `)
      .all(...relatedInCollection.map((r) => r.id)) as { id: number; name: string }[];
  }

  if (existing.length === 0 && relatedInCollection.length === 0) return null;

  const titles = [seedRow.title, ...relatedInCollection.map((r) => r.title)];
  let suggested = longestCommonPrefix(titles);
  if (!suggested || suggested.length < 3) suggested = trimVolumeMarker(seedRow.title);
  if (!suggested) suggested = seedRow.title;

  return {
    existing,
    suggestedName: suggested,
    relatedInCollection,
  };
}
