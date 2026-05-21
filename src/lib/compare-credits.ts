import 'server-only';
import { db } from './db';

/**
 * Character voiced by a shared seiyuu in one compared VN.
 */
export interface SharedVaCharacterCredit {
  c_id: string;
  c_name: string;
}

/**
 * Per-VN character list for one shared seiyuu.
 */
export interface SharedVaVnCredit {
  vn_id: string;
  characters: SharedVaCharacterCredit[];
}

/**
 * Voice actor that appears in every VN currently compared.
 */
export interface SharedVa {
  sid: string;
  va_name: string;
  va_original: string | null;
  creditsByVn: SharedVaVnCredit[];
  totalCharacters: number;
}

/**
 * Finds voice actors credited on every compared VN.
 *
 * @param vnIds VN ids from the compare page.
 * @returns Shared voice actors grouped by VN, preserving input VN order.
 */
export function findSharedVasForVns(vnIds: string[]): SharedVa[] {
  const uniqueIds = Array.from(new Set(vnIds));
  if (uniqueIds.length < 2) return [];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT vn_id, sid, va_name, va_original, c_id, c_name
      FROM vn_va_credit
      WHERE vn_id IN (${placeholders})
    `)
    .all(...uniqueIds) as Array<{
      vn_id: string;
      sid: string;
      va_name: string;
      va_original: string | null;
      c_id: string;
      c_name: string;
    }>;

  const bySid = new Map<string, {
    va_name: string;
    va_original: string | null;
    vnIds: Set<string>;
    byVn: Map<string, Map<string, SharedVaCharacterCredit>>;
  }>();

  for (const r of rows) {
    let bucket = bySid.get(r.sid);
    if (!bucket) {
      bucket = {
        va_name: r.va_name,
        va_original: r.va_original,
        vnIds: new Set(),
        byVn: new Map(),
      };
      bySid.set(r.sid, bucket);
    }
    bucket.vnIds.add(r.vn_id);
    let characterMap = bucket.byVn.get(r.vn_id);
    if (!characterMap) {
      characterMap = new Map();
      bucket.byVn.set(r.vn_id, characterMap);
    }
    characterMap.set(r.c_id, { c_id: r.c_id, c_name: r.c_name });
  }

  return Array.from(bySid.entries())
    .filter(([, bucket]) => bucket.vnIds.size === uniqueIds.length)
    .map(([sid, bucket]) => {
      const creditsByVn = uniqueIds.map((vn_id) => ({
        vn_id,
        characters: Array.from(bucket.byVn.get(vn_id)?.values() ?? []),
      }));
      const totalCharacters = creditsByVn.reduce((sum, credit) => sum + credit.characters.length, 0);
      return {
        sid,
        va_name: bucket.va_name,
        va_original: bucket.va_original,
        creditsByVn,
        totalCharacters,
      };
    })
    .sort((a, b) => b.totalCharacters - a.totalCharacters || a.va_name.localeCompare(b.va_name));
}
