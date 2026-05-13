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

export interface BrandOverlapEntry {
  sid: string;
  name: string;
  original: string | null;
  /** True when this staff has voice credits crossing both brands. */
  isVa: boolean;
  aCredits: Array<{ vn_id: string; title: string; role: string }>;
  bCredits: Array<{ vn_id: string; title: string; role: string }>;
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

  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'staff_full:%'`)
    .all() as { body: string }[];

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
      const role = c.roles.map((r2) => r2.role).join(' / ');
      const entry = { vn_id: c.id, title: c.title, role };
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
      const chars = c.characters.map((ch) => ch.name).slice(0, 3).join(', ');
      const entry = { vn_id: c.id, title: c.title, role: chars ? `CV: ${chars}` : 'CV' };
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
