import 'server-only';
import { db } from './db';
import { fetchProducerCompletion } from './producer-completion';
import { getProducer } from './vndb';
import type { StaffFullPayload } from './staff-full';

/**
 * For two brands (developers), surface every staff member / VA who has
 * credits at both. Powers /brand-overlap?a=…&b=…
 *
 * Data sources:
 *   - fetchProducerCompletion(brand) → full VN list per brand (cachedFetch).
 *   - Every locally-cached staff_full payload (vndb_cache rows keyed
 *     `staff_full:s…`) — populated by the per-VN fan-out we already do
 *     when the user downloads a VN.
 *
 * For each cached staff, the result lists their credits that fall inside
 * brand A's catalogue and brand B's catalogue, with the role for each.
 * Staff with zero crossover in either side are filtered out.
 */

export interface BrandOverlapBrand {
  id: string;
  name: string;
  vnCount: number;
}

/**
 * Roles as raw VNDB role enum strings (`scenario`, `art`, …) plus
 * `va:<character>` synthetic entries for voice credits. The page is
 * responsible for localising via `roleLabel` / `t.characters.castLabel`.
 */
export interface BrandOverlapEntry {
  sid: string;
  name: string;
  original: string | null;
  /** True when this staff has voice credits crossing both brands. */
  isVa: boolean;
  aCredits: Array<{ vn_id: string; title: string; roles: string[] }>;
  bCredits: Array<{ vn_id: string; title: string; roles: string[] }>;
}

export interface BrandOverlapResult {
  a: BrandOverlapBrand | null;
  b: BrandOverlapBrand | null;
  /** Sorted by total credits (a + b) descending. */
  entries: BrandOverlapEntry[];
  /** True when no staff_full payloads are cached — usually means the user
   *  hasn't downloaded enough of either brand's catalogue yet. */
  needsMoreData: boolean;
}

async function brandInfo(id: string, vnCount: number): Promise<BrandOverlapBrand | null> {
  try {
    const p = await getProducer(id);
    if (!p) return null;
    return { id, name: p.name, vnCount };
  } catch {
    return { id, name: id, vnCount };
  }
}

export async function findBrandStaffOverlap(brandA: string, brandB: string): Promise<BrandOverlapResult> {
  const [compA, compB] = await Promise.all([
    fetchProducerCompletion(brandA),
    fetchProducerCompletion(brandB),
  ]);
  const setA = new Set(compA.vns.map((v) => v.vnId));
  const setB = new Set(compB.vns.map((v) => v.vnId));
  const [a, b] = await Promise.all([brandInfo(brandA, compA.totalKnown), brandInfo(brandB, compB.totalKnown)]);

  // Step 1: narrow which staff matter via the derived index, instead of
  // scanning every cached staff_full body. Returns staff who have at least
  // one credit on either brand — the final overlap check still happens in
  // JS after parsing.
  const allVnIds = Array.from(new Set([...setA, ...setB]));
  if (allVnIds.length === 0) return { a, b, entries: [], needsMoreData: true };

  const candidateSids = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < allVnIds.length; i += CHUNK) {
    const chunk = allVnIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const found = db
      .prepare(`SELECT DISTINCT sid FROM staff_credit_index WHERE vn_id IN (${placeholders})`)
      .all(...chunk) as { sid: string }[];
    for (const r of found) candidateSids.add(r.sid);
  }
  if (candidateSids.size === 0) {
    const cacheRowCount = (db
      .prepare(`SELECT COUNT(*) AS n FROM vndb_cache WHERE cache_key LIKE 'staff_full:%'`)
      .get() as { n: number }).n;
    return { a, b, entries: [], needsMoreData: cacheRowCount === 0 };
  }

  const sidList = Array.from(candidateSids);
  const cacheKeys = sidList.map((s) => `staff_full:${s.toLowerCase()}`);
  const placeholders = cacheKeys.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key IN (${placeholders})`)
    .all(...cacheKeys) as { body: string }[];

  const entries: BrandOverlapEntry[] = [];
  for (const r of rows) {
    let payload: StaffFullPayload;
    try {
      payload = JSON.parse(r.body) as StaffFullPayload;
    } catch {
      continue;
    }
    if (!payload.profile) continue;

    const aProd: BrandOverlapEntry['aCredits'] = [];
    const bProd: BrandOverlapEntry['bCredits'] = [];
    for (const c of payload.productionCredits ?? []) {
      const inA = setA.has(c.id);
      const inB = setB.has(c.id);
      if (!inA && !inB) continue;
      const roles = c.roles.map((r2) => r2.role);
      const entry = { vn_id: c.id, title: c.title, roles };
      if (inA) aProd.push(entry);
      if (inB) bProd.push(entry);
    }
    let aVa = false, bVa = false;
    const aVaList: BrandOverlapEntry['aCredits'] = [];
    const bVaList: BrandOverlapEntry['bCredits'] = [];
    for (const c of payload.vaCredits ?? []) {
      const inA = setA.has(c.id);
      const inB = setB.has(c.id);
      if (!inA && !inB) continue;
      const chars = c.characters.map((ch) => ch.name).slice(0, 3);
      // `va:<chars>` is a synthetic marker; the page maps it to
      // `t.characters.castLabel` + the joined character names.
      const entry = { vn_id: c.id, title: c.title, roles: [chars.length > 0 ? `va:${chars.join(', ')}` : 'va'] };
      if (inA) { aVaList.push(entry); aVa = true; }
      if (inB) { bVaList.push(entry); bVa = true; }
    }

    const aCredits = [...aProd, ...aVaList];
    const bCredits = [...bProd, ...bVaList];
    if (aCredits.length === 0 || bCredits.length === 0) continue;

    entries.push({
      sid: payload.profile.id,
      name: payload.profile.name,
      original: payload.profile.original,
      isVa: aVa || bVa,
      aCredits,
      bCredits,
    });
  }

  entries.sort((x, y) => (y.aCredits.length + y.bCredits.length) - (x.aCredits.length + x.bCredits.length));
  return { a, b, entries, needsMoreData: rows.length === 0 };
}
