/**
 * Pure helper that derives the rich-header field set for the
 * `/staff/[id]` page.
 *
 * The page receives two inputs:
 *  - A `VndbStaff` profile from the staff_full cache (the "extras" —
 *    aliases, language, gender, description, extlinks).
 *  - A pair of `production` / `voice` credit counts derived from the
 *    local SQLite mirror.
 *
 * `getStaffWithExtras` normalises these into one display struct so
 * the React server component renders a single object and the unit
 * test pins the exact shape (aliases without the canonical `ismain`
 * row, extlinks de-duped, credit summary string).
 *
 * Kept dependency-free (no React, no `server-only`) so the test file
 * can import it directly.
 */

export interface StaffExtrasInput {
  /** Profile from the staff_full cache, may be null when offline. */
  profile: {
    id: string;
    name: string;
    original: string | null;
    lang: string | null;
    gender: string | null;
    description: string | null;
    aliases: Array<{ aid: number; name: string; latin: string | null; ismain: boolean }>;
    extlinks: Array<{ url: string; label: string; name: string; id?: string | number | null }>;
  } | null;
  productionCount: number;
  voiceCount: number;
}

export interface StaffWithExtras {
  /** Display name (falls back to id when offline). */
  name: string;
  original: string | null;
  lang: string | null;
  gender: string | null;
  description: string | null;
  /** Aliases excluding the canonical `ismain` entry, de-duped. */
  aliases: Array<{ aid: number; name: string; latin: string | null }>;
  /** Extlinks de-duped by URL. */
  extlinks: Array<{ url: string; label: string; name: string }>;
  /** Pre-computed counts so the consumer doesn't recompute. */
  productionCount: number;
  voiceCount: number;
}

export function getStaffWithExtras(input: StaffExtrasInput): StaffWithExtras {
  const p = input.profile;
  // Aliases: drop the `ismain` row (it's redundant with the canonical
  // `name`) and de-dupe by aid so a malformed VNDB payload doesn't
  // double-render.
  const aliasMap = new Map<number, { aid: number; name: string; latin: string | null }>();
  for (const a of p?.aliases ?? []) {
    if (a.ismain) continue;
    if (!aliasMap.has(a.aid)) {
      aliasMap.set(a.aid, { aid: a.aid, name: a.name, latin: a.latin });
    }
  }
  // Extlinks: de-dupe by URL.
  const linkMap = new Map<string, { url: string; label: string; name: string }>();
  for (const l of p?.extlinks ?? []) {
    if (!l?.url) continue;
    if (!linkMap.has(l.url)) {
      linkMap.set(l.url, { url: l.url, label: l.label, name: l.name });
    }
  }
  return {
    name: p?.name ?? '',
    original: p?.original ?? null,
    lang: p?.lang ?? null,
    gender: p?.gender ?? null,
    description: p?.description ?? null,
    aliases: Array.from(aliasMap.values()),
    extlinks: Array.from(linkMap.values()),
    productionCount: input.productionCount,
    voiceCount: input.voiceCount,
  };
}

/** Format the per-page credit summary string from the locale template. */
export function formatCreditCountSummary(
  template: string,
  prod: number,
  va: number,
): string {
  return template.replace('{prod}', String(prod)).replace('{va}', String(va));
}
