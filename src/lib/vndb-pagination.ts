import type { VndbResultsEnvelope } from './vndb-response-shape';

export const MAX_EXHAUSTIVE_VNDB_PAGES = 100;

/** Collect every VNDB page while keeping the first occurrence of each id. */
export async function collectUniqueVndbPages<T extends { id: string }>(
  loadPage: (page: number) => Promise<VndbResultsEnvelope<T>>,
  maxPages = MAX_EXHAUSTIVE_VNDB_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await loadPage(page);
    for (const row of response.results) {
      const id = row.id.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
    if (!response.more) return out;
  }
  throw new Error(`VNDB pagination exceeded ${maxPages} pages`);
}
