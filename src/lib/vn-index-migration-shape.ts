import { asJsonRecord, parseJsonRecord } from './json-shape';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const MAX_ROWS = 5000;

interface MigratableStaffCredit {
  id: string;
  aid: number | null;
  eid: number | null;
  role: string;
  note: string | null;
  name: string;
  original: string | null;
  lang: string | null;
}

interface MigratableVaCredit {
  note: string | null;
  character: {
    id: string;
    name: string;
    original: string | null;
    imageUrl: string | null;
  };
  staff: {
    id: string;
    aid: number | null;
    name: string;
    original: string | null;
    lang: string | null;
  };
}

interface MigratableTagIndexRow {
  id: string;
  name: string;
  spoiler: number;
  category: string | null;
}

interface StaffCreditIndexPayload {
  productionIds: string[];
  vaIds: string[];
}

function parseBoundedArray(raw: string | null | undefined): unknown[] | null {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return asBoundedArray(value);
  } catch {
    return null;
  }
}

function asBoundedArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length <= MAX_ROWS ? value : null;
}

function isOptionalSafeInteger(value: unknown): boolean {
  return value === undefined || value === null || Number.isSafeInteger(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/** Decode historical VN staff credits before rebuilding the SQLite index. */
export function decodeMigratableStaffCredits(raw: string | null | undefined): MigratableStaffCredit[] | null {
  const rows = parseBoundedArray(raw);
  if (!rows) return null;
  const out: MigratableStaffCredit[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !/^s\d+$/i.test(row.id) ||
      typeof row.name !== 'string' ||
      !isOptionalSafeInteger(row.aid) ||
      !isOptionalSafeInteger(row.eid) ||
      (row.role !== undefined && typeof row.role !== 'string') ||
      !isOptionalNullableString(row.note) ||
      !isOptionalNullableString(row.original) ||
      !isOptionalNullableString(row.lang)
    ) continue;
    out.push({
      id: row.id.toLowerCase(),
      aid: typeof row.aid === 'number' ? row.aid : null,
      eid: typeof row.eid === 'number' ? row.eid : null,
      role: typeof row.role === 'string' ? row.role : '',
      note: typeof row.note === 'string' ? row.note : null,
      name: row.name,
      original: typeof row.original === 'string' ? row.original : null,
      lang: typeof row.lang === 'string' ? row.lang : null,
    });
  }
  return out;
}

/** Decode historical VN voice credits before rebuilding the SQLite index. */
export function decodeMigratableVaCredits(raw: string | null | undefined): MigratableVaCredit[] | null {
  const rows = parseBoundedArray(raw);
  if (!rows) return null;
  const out: MigratableVaCredit[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    const character = asJsonRecord(row?.character);
    const staff = asJsonRecord(row?.staff);
    const image = character?.image === undefined || character.image === null ? character?.image : asJsonRecord(character.image);
    if (
      !row ||
      !character ||
      !staff ||
      typeof character.id !== 'string' ||
      !/^c\d+$/i.test(character.id) ||
      typeof character.name !== 'string' ||
      !isOptionalNullableString(character.original) ||
      (image !== undefined && image !== null && typeof image.url !== 'string') ||
      typeof staff.id !== 'string' ||
      !/^s\d+$/i.test(staff.id) ||
      typeof staff.name !== 'string' ||
      !isOptionalSafeInteger(staff.aid) ||
      !isOptionalNullableString(staff.original) ||
      !isOptionalNullableString(staff.lang) ||
      !isOptionalNullableString(row.note)
    ) continue;
    out.push({
      note: typeof row.note === 'string' ? row.note : null,
      character: {
        id: character.id.toLowerCase(),
        name: character.name,
        original: typeof character.original === 'string' ? character.original : null,
        imageUrl: image && typeof image.url === 'string' ? image.url : null,
      },
      staff: {
        id: staff.id.toLowerCase(),
        aid: typeof staff.aid === 'number' ? staff.aid : null,
        name: staff.name,
        original: typeof staff.original === 'string' ? staff.original : null,
        lang: typeof staff.lang === 'string' ? staff.lang : null,
      },
    });
  }
  return out;
}

/** Decode the minimal staff full-cache fields needed by its index rebuild. */
export function decodeStaffCreditIndexPayload(raw: string | null | undefined): StaffCreditIndexPayload | null {
  const payload = parseJsonRecord(raw);
  const productionRows = asBoundedArray(payload?.productionCredits);
  const vaRows = asBoundedArray(payload?.vaCredits);
  if (!productionRows || !vaRows) return null;
  return {
    productionIds: decodeVnIds(productionRows),
    vaIds: decodeVnIds(vaRows),
  };
}

/** Decode historical tag summaries before rebuilding the SQLite index. */
export function decodeMigratableTagIndexRows(raw: string | null | undefined): MigratableTagIndexRow[] | null {
  const rows = parseBoundedArray(raw);
  if (!rows) return null;
  const out: MigratableTagIndexRow[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    if (!row || typeof row.id !== 'string' || !/^g\d+$/i.test(row.id)) continue;
    out.push({
      id: row.id.toLowerCase(),
      name: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name : row.id.toLowerCase(),
      spoiler: typeof row.spoiler === 'number' && Number.isFinite(row.spoiler) ? row.spoiler : 0,
      category: typeof row.category === 'string' ? row.category : null,
    });
  }
  return out;
}

/** Decode historical producer summaries before rebuilding a producer index. */
export function decodeMigratableProducerIds(raw: string | null | undefined): string[] | null {
  const rows = parseBoundedArray(raw);
  if (!rows) return null;
  const ids: string[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    if (typeof row?.id === 'string' && /^p\d+$/i.test(row.id)) ids.push(row.id.toLowerCase());
  }
  return ids;
}

/** Decode historical string lists before rebuilding a scalar index. */
export function decodeMigratableStringValues(raw: string | null | undefined): string[] | null {
  const rows = parseBoundedArray(raw);
  if (!rows) return null;
  return rows.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function decodeVnIds(rows: unknown[]): string[] {
  const ids: string[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    if (typeof row?.id === 'string' && isVndbVnId(row.id)) ids.push(normalizeVnId(row.id));
  }
  return ids;
}
