import { asJsonRecord } from './json-shape';
import type { VndbTagHomeTree, VndbTagListItem, VndbTagTreeGroup, VndbTagTreeNode } from './vndb-tag-web-parser';
import type { VndbTag, VndbTrait } from './vndb-types';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_TEXTUAL_HITS = 50;
const MAX_FLAT_ROWS = 200;
const MAX_BROWSE_ROWS = 10_000;
const MAX_TREE_ROWS = 10_000;
const MAX_TREE_DEPTH = 8;
const TAG_ID_RE = /^g\d+$/i;
const TRAIT_ID_RE = /^i\d+$/i;

/** Local note, description, or quote result rendered by textual search. */
export interface TextualSearchHit {
  vn_id: string;
  title: string;
  source: 'notes' | 'custom_description' | 'quote';
  snippet: string;
}

/** Validated scraped tag-tree API payload rendered by the VNDB tag browser. */
export interface TagHomeTreeResponse {
  data: VndbTagHomeTree;
  warning: string | null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= MAX_FLAT_ROWS && value.every((row) => typeof row === 'string')
    ? value
    : null;
}

function decodeTag(value: unknown): VndbTag | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !TAG_ID_RE.test(row.id) ||
    typeof row.name !== 'string' ||
    !aliases ||
    !isNullableString(row.description) ||
    (row.category !== 'cont' && row.category !== 'ero' && row.category !== 'tech') ||
    typeof row.searchable !== 'boolean' ||
    typeof row.applicable !== 'boolean' ||
    !isNonNegativeInteger(row.vn_count)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    aliases,
    description: row.description,
    category: row.category,
    searchable: row.searchable,
    applicable: row.applicable,
    vn_count: row.vn_count,
  };
}

function decodeTrait(value: unknown): VndbTrait | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !TRAIT_ID_RE.test(row.id) ||
    typeof row.name !== 'string' ||
    !aliases ||
    !isNullableString(row.description) ||
    typeof row.searchable !== 'boolean' ||
    typeof row.applicable !== 'boolean' ||
    typeof row.sexual !== 'boolean' ||
    !isNullableString(row.group_id) ||
    (row.group_id !== null && !TRAIT_ID_RE.test(row.group_id)) ||
    !isNullableString(row.group_name) ||
    !isNonNegativeInteger(row.char_count)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    aliases,
    description: row.description,
    searchable: row.searchable,
    applicable: row.applicable,
    sexual: row.sexual,
    group_id: row.group_id?.toLowerCase() ?? null,
    group_name: row.group_name,
    char_count: row.char_count,
  };
}

function isOptionalNullableCount(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNonNegativeInteger(value);
}

function canonicalTagHref(id: string): string {
  return `/tag/${id.toLowerCase()}?tab=vndb`;
}

function decodeTagTreeNode(value: unknown, budget: { rows: number }, depth = 0): VndbTagTreeNode | null {
  if (depth > MAX_TREE_DEPTH || budget.rows >= MAX_TREE_ROWS) return null;
  budget.rows += 1;
  const row = asJsonRecord(value);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !TAG_ID_RE.test(row.id) ||
    typeof row.name !== 'string' ||
    row.href !== canonicalTagHref(row.id) ||
    !isOptionalNullableCount(row.count) ||
    !isOptionalNullableCount(row.moreCount) ||
    (row.children !== undefined && !Array.isArray(row.children))
  ) {
    return null;
  }
  const children: VndbTagTreeNode[] = [];
  for (const value of row.children ?? []) {
    const child = decodeTagTreeNode(value, budget, depth + 1);
    if (!child) return null;
    children.push(child);
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    href: canonicalTagHref(row.id),
    ...(row.count !== undefined ? { count: row.count } : {}),
    ...(row.children !== undefined ? { children } : {}),
    ...(row.moreCount !== undefined ? { moreCount: row.moreCount } : {}),
  };
}

function decodeTagTreeGroup(value: unknown, budget: { rows: number }): VndbTagTreeGroup | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !TAG_ID_RE.test(row.id) ||
    typeof row.label !== 'string' ||
    row.href !== canonicalTagHref(row.id) ||
    !Array.isArray(row.children) ||
    !isOptionalNullableCount(row.moreCount)
  ) {
    return null;
  }
  const children: VndbTagTreeNode[] = [];
  for (const value of row.children) {
    const child = decodeTagTreeNode(value, budget);
    if (!child) return null;
    children.push(child);
  }
  return {
    id: row.id.toLowerCase(),
    label: row.label,
    href: canonicalTagHref(row.id),
    children,
    ...(row.moreCount !== undefined ? { moreCount: row.moreCount } : {}),
  };
}

function decodeTagListItem(value: unknown, budget: { rows: number }): VndbTagListItem | null {
  if (budget.rows >= MAX_TREE_ROWS) return null;
  budget.rows += 1;
  const row = asJsonRecord(value);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !TAG_ID_RE.test(row.id) ||
    typeof row.name !== 'string' ||
    row.href !== canonicalTagHref(row.id) ||
    !isOptionalNullableCount(row.count) ||
    (row.dateLabel !== undefined && !isNullableString(row.dateLabel))
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    href: canonicalTagHref(row.id),
    ...(row.count !== undefined ? { count: row.count } : {}),
    ...(row.dateLabel !== undefined ? { dateLabel: row.dateLabel } : {}),
  };
}

/**
 * Decode textual-search rows before rendering local snippets.
 *
 * @param value Parsed local API payload.
 * @returns Safe textual hits, or `null` for malformed input.
 */
export function decodeTextualSearchHits(value: unknown): TextualSearchHit[] | null {
  const hits = asJsonRecord(value)?.hits;
  if (!Array.isArray(hits) || hits.length > MAX_TEXTUAL_HITS) return null;
  const out: TextualSearchHit[] = [];
  for (const value of hits) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.vn_id !== 'string' ||
      !isValidVnId(row.vn_id) ||
      typeof row.title !== 'string' ||
      (row.source !== 'notes' && row.source !== 'custom_description' && row.source !== 'quote') ||
      typeof row.snippet !== 'string'
    ) {
      return null;
    }
    out.push({
      vn_id: normalizeVnId(row.vn_id),
      title: row.title,
      source: row.source,
      snippet: row.snippet,
    });
  }
  return out;
}

/**
 * Decode flat tag rows before rendering tag browsers.
 *
 * @param value Parsed local API payload.
 * @returns Safe tags, or `null` for malformed input.
 */
export function decodeTagsResponse(value: unknown): VndbTag[] | null {
  const tags = asJsonRecord(value)?.tags;
  if (!Array.isArray(tags) || tags.length > MAX_BROWSE_ROWS) return null;
  const out: VndbTag[] = [];
  for (const value of tags) {
    const tag = decodeTag(value);
    if (!tag) return null;
    out.push(tag);
  }
  return out;
}

/**
 * Decode flat trait rows before rendering trait browsers.
 *
 * @param value Parsed local API payload.
 * @returns Safe traits, or `null` for malformed input.
 */
export function decodeTraitsResponse(value: unknown): VndbTrait[] | null {
  const traits = asJsonRecord(value)?.traits;
  if (!Array.isArray(traits) || traits.length > MAX_BROWSE_ROWS) return null;
  const out: VndbTrait[] = [];
  for (const value of traits) {
    const trait = decodeTrait(value);
    if (!trait) return null;
    out.push(trait);
  }
  return out;
}

/**
 * Decode scraped tag hierarchy hydration before rendering its recursive tree.
 *
 * @param value Parsed local API payload.
 * @returns Safe hierarchy payload, or `null` for malformed input.
 */
export function decodeTagHomeTreeResponse(value: unknown): TagHomeTreeResponse | null {
  const row = asJsonRecord(value);
  const data = asJsonRecord(row?.data);
  if (
    !row ||
    !data ||
    !isNonNegativeInteger(row.fetched_at) ||
    typeof row.stale !== 'boolean' ||
    typeof row.source_url !== 'string' ||
    (row.warning !== undefined && !isNullableString(row.warning)) ||
    !Array.isArray(data.groups) ||
    !Array.isArray(data.recentlyAdded) ||
    !Array.isArray(data.popular) ||
    (data.recentlyTaggedHref !== undefined && data.recentlyTaggedHref !== null && data.recentlyTaggedHref !== '/g/links')
  ) {
    return null;
  }
  const budget = { rows: 0 };
  const groups: VndbTagTreeGroup[] = [];
  for (const value of data.groups) {
    const group = decodeTagTreeGroup(value, budget);
    if (!group) return null;
    groups.push(group);
  }
  const recentlyAdded: VndbTagListItem[] = [];
  for (const value of data.recentlyAdded) {
    const item = decodeTagListItem(value, budget);
    if (!item) return null;
    recentlyAdded.push(item);
  }
  const popular: VndbTagListItem[] = [];
  for (const value of data.popular) {
    const item = decodeTagListItem(value, budget);
    if (!item) return null;
    popular.push(item);
  }
  return {
    data: {
      groups,
      recentlyAdded,
      popular,
      ...(data.recentlyTaggedHref !== undefined ? { recentlyTaggedHref: data.recentlyTaggedHref } : {}),
    },
    warning: row.warning ?? null,
  };
}
