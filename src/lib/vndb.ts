import 'server-only';
import { cachedFetch, invalidateKey, TTL } from './vndb-cache';
import type { Screenshot, VndbSearchHit } from './types';

export const VNDB_API = 'https://api.vndb.org/kana';

const VN_DETAIL_FIELDS = [
  'title',
  'alttitle',
  'olang',
  'released',
  'languages',
  'platforms',
  'length',
  'length_minutes',
  'length_votes',
  'rating',
  'votecount',
  'average',
  'description',
  'image.url',
  'image.thumbnail',
  'image.dims',
  'image.sexual',
  'image.violence',
  'developers{id,name,original,lang,type}',
  'tags{id,name,category,rating,spoiler}',
  'screenshots{url,thumbnail,sexual,violence,dims}',
].join(', ');

const VN_SEARCH_FIELDS = [
  'title',
  'alttitle',
  'released',
  'image.url',
  'image.thumbnail',
  'rating',
  'votecount',
  'length_minutes',
  'languages',
  'platforms',
  'developers{id,name}',
].join(', ');

const PRODUCER_FIELDS = ['name', 'original', 'aliases', 'lang', 'type', 'description', 'extlinks{url,label,name}'].join(', ');

const CHARACTER_FIELDS = [
  'name',
  'original',
  'aliases',
  'description',
  'image.url',
  'image.dims',
  'image.sexual',
  'image.violence',
  'blood_type',
  'height',
  'weight',
  'bust',
  'waist',
  'hips',
  'cup',
  'age',
  'birthday',
  'sex',
  'gender',
  'vns{id,role,spoiler,title,alttitle,released,image.url,image.thumbnail,image.sexual,rating}',
  'traits{id,name,group_name,spoiler,sexual}',
].join(', ');

const STAFF_FIELDS = [
  'aid',
  'ismain',
  'name',
  'original',
  'lang',
  'gender',
  'description',
  'extlinks{url,label,name}',
].join(', ');

const TAG_FIELDS = ['name', 'aliases', 'description', 'category', 'searchable', 'applicable', 'vn_count'].join(', ');

const TRAIT_FIELDS = ['name', 'aliases', 'description', 'searchable', 'applicable', 'sexual', 'group_id', 'group_name', 'char_count'].join(', ');

const RELEASE_FIELDS = [
  'title',
  'alttitle',
  'languages{lang,title,latin,mtl,main}',
  'platforms',
  'media{medium,qty}',
  'released',
  'minage',
  'patch',
  'freeware',
  'uncensored',
  'official',
  'has_ero',
  'resolution',
  'engine',
  'voiced',
  'notes',
  'gtin',
  'catalog',
  'producers{id,name,developer,publisher}',
  'extlinks{url,label,name}',
  'vns{id,rtype}',
  'images{id,url,thumbnail,dims,sexual,violence,type,languages,photo,vn}',
].join(', ');

const QUOTE_FIELDS = ['quote', 'score', 'vn{id,title}', 'character{id,name,original}'].join(', ');

function authHeaders(): Record<string, string> {
  const token = process.env.VNDB_TOKEN;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Token ${token}`;
  return headers;
}

async function vndbPost<T>(path: string, body: unknown, ttlMs: number): Promise<T> {
  const r = await cachedFetch<T>(`${VNDB_API}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    __pathTag: `POST ${path}`,
  }, { ttlMs });
  return r.data;
}

async function vndbGet<T>(path: string, ttlMs: number): Promise<T> {
  const r = await cachedFetch<T>(`${VNDB_API}${path}`, {
    method: 'GET',
    headers: authHeaders(),
    __pathTag: `GET ${path}`,
  }, { ttlMs });
  return r.data;
}

interface VndbResponse<T> {
  results: T[];
  more: boolean;
  count?: number;
}

// VN
export async function searchVn(
  query: string,
  { results = 30, page = 1 }: { results?: number; page?: number } = {},
): Promise<VndbResponse<Omit<VndbSearchHit, 'in_collection'>>> {
  const trimmed = query.trim();
  const isId = /^v\d+$/i.test(trimmed);
  return vndbPost('/vn', {
    filters: isId ? ['id', '=', trimmed.toLowerCase()] : ['search', '=', trimmed],
    fields: VN_SEARCH_FIELDS,
    sort: isId ? 'id' : 'searchrank',
    results,
    page,
  }, isId ? TTL.vnDetail : TTL.vnSearch);
}

export interface AdvancedSearchOptions {
  q?: string;
  langs?: string[];
  platforms?: string[];
  lengthMin?: number; // 1..5
  lengthMax?: number;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number; // 10..100
  hasScreenshot?: boolean;
  hasReview?: boolean;
  hasAnime?: boolean;
  results?: number;
  page?: number;
  sort?: 'searchrank' | 'rating' | 'votecount' | 'released' | 'title';
  reverse?: boolean;
}

function multi(field: string, values: string[]): unknown {
  // VNDB rejects an 'or' clause with fewer than 2 predicates.
  if (values.length === 0) return null;
  if (values.length === 1) return [field, '=', values[0]];
  return ['or', ...values.map((v) => [field, '=', v])];
}

export async function advancedSearchVn(
  opts: AdvancedSearchOptions,
): Promise<VndbResponse<Omit<VndbSearchHit, 'in_collection'>>> {
  const clauses: unknown[] = [];
  if (opts.q?.trim()) clauses.push(['search', '=', opts.q.trim()]);
  if (opts.langs?.length) clauses.push(multi('lang', opts.langs));
  if (opts.platforms?.length) clauses.push(multi('platform', opts.platforms));
  // VNDB only accepts exact equality for `length`, so expand any range into an `or` of values.
  const minL = typeof opts.lengthMin === 'number' ? opts.lengthMin : null;
  const maxL = typeof opts.lengthMax === 'number' ? opts.lengthMax : null;
  if (minL != null || maxL != null) {
    const lo = Math.max(1, minL ?? 1);
    const hi = Math.min(5, maxL ?? 5);
    const lengths: number[] = [];
    for (let n = lo; n <= hi; n++) lengths.push(n);
    if (lengths.length === 1) clauses.push(['length', '=', lengths[0]]);
    else if (lengths.length > 1) clauses.push(['or', ...lengths.map((n) => ['length', '=', n])]);
  }
  if (typeof opts.yearMin === 'number') clauses.push(['released', '>=', `${opts.yearMin}-01-01`]);
  if (typeof opts.yearMax === 'number') clauses.push(['released', '<=', `${opts.yearMax}-12-31`]);
  if (typeof opts.ratingMin === 'number') clauses.push(['rating', '>=', opts.ratingMin]);
  if (opts.hasScreenshot) clauses.push(['has_screenshot', '=', 1]);
  if (opts.hasReview) clauses.push(['has_review', '=', 1]);
  if (opts.hasAnime) clauses.push(['has_anime', '=', 1]);

  const cleaned = clauses.filter((c) => c != null);
  // 'and' also requires ≥2 predicates — collapse otherwise.
  let useFilters: unknown;
  if (cleaned.length === 0) useFilters = undefined;
  else if (cleaned.length === 1) useFilters = cleaned[0];
  else useFilters = ['and', ...cleaned];

  const sort = opts.sort ?? (opts.q ? 'searchrank' : 'rating');
  return vndbPost('/vn', {
    filters: useFilters,
    fields: VN_SEARCH_FIELDS,
    sort,
    reverse: opts.reverse ?? sort !== 'searchrank',
    results: Math.min(opts.results ?? 30, 100),
    page: opts.page ?? 1,
  }, TTL.vnSearch);
}

export interface VndbVn {
  id: string;
  title: string;
  alttitle: string | null;
  olang: string | null;
  released: string | null;
  languages: string[];
  platforms: string[];
  length: number | null;
  length_minutes: number | null;
  rating: number | null;
  votecount: number | null;
  description: string | null;
  image: { url: string; thumbnail: string; dims: [number, number]; sexual?: number; violence?: number } | null;
  developers: { id: string; name: string; original?: string | null; lang?: string | null; type?: string | null }[];
  tags: { id: string; name: string; rating: number; spoiler: number; category: string }[];
  screenshots: Screenshot[];
}

export async function getVn(id: string): Promise<VndbVn | null> {
  const r = await vndbPost<VndbResponse<VndbVn>>('/vn', {
    filters: ['id', '=', id],
    fields: VN_DETAIL_FIELDS,
    results: 1,
  }, TTL.vnDetail);
  return r.results[0] ?? null;
}

export function invalidateVnCache(id: string): void {
  invalidateKey('POST', '/vn', {
    filters: ['id', '=', id],
    fields: VN_DETAIL_FIELDS,
    results: 1,
  });
}

export async function refreshVn(id: string): Promise<VndbVn | null> {
  invalidateVnCache(id);
  return getVn(id);
}

// Producer
export interface VndbProducer {
  id: string;
  name: string;
  original: string | null;
  aliases: string[];
  lang: string | null;
  type: string | null;
  description: string | null;
  extlinks: { url: string; label: string; name: string }[];
}

export async function getProducer(id: string): Promise<VndbProducer | null> {
  const r = await vndbPost<VndbResponse<VndbProducer>>('/producer', {
    filters: ['id', '=', id],
    fields: PRODUCER_FIELDS,
    results: 1,
  }, TTL.producer);
  return r.results[0] ?? null;
}

// Character
export interface VndbCharacter {
  id: string;
  name: string;
  original: string | null;
  aliases: string[];
  description: string | null;
  image: { url: string; dims?: [number, number]; sexual?: number; violence?: number } | null;
  blood_type: string | null;
  height: number | null;
  weight: number | null;
  bust: number | null;
  waist: number | null;
  hips: number | null;
  cup: string | null;
  age: number | null;
  birthday: [number, number] | null;
  sex: [string | null, string | null] | null;
  gender: [string | null, string | null] | null;
  vns: VndbCharacterVn[];
  traits: { id: string; name: string; group_name: string; spoiler: number; sexual: boolean }[];
}

export interface VndbCharacterVn {
  id: string;
  role: 'main' | 'primary' | 'side' | 'appears';
  spoiler: number;
  title?: string;
  alttitle?: string | null;
  released?: string | null;
  image?: { url: string; thumbnail?: string; sexual?: number } | null;
  rating?: number | null;
}

export async function getCharactersForVn(vnId: string, max = 30): Promise<VndbCharacter[]> {
  const r = await vndbPost<VndbResponse<VndbCharacter>>('/character', {
    filters: ['vn', '=', ['id', '=', vnId]],
    fields: CHARACTER_FIELDS,
    results: Math.min(max, 100),
  }, TTL.characters);
  return r.results;
}

export async function getCharacter(id: string): Promise<VndbCharacter | null> {
  const r = await vndbPost<VndbResponse<VndbCharacter>>('/character', {
    filters: ['id', '=', id],
    fields: CHARACTER_FIELDS,
    results: 1,
  }, TTL.characterById);
  return r.results[0] ?? null;
}

export async function searchCharacters(query: string, { results = 30 } = {}): Promise<VndbCharacter[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const isId = /^c\d+$/i.test(trimmed);
  const r = await vndbPost<VndbResponse<VndbCharacter>>('/character', {
    filters: isId ? ['id', '=', trimmed.toLowerCase()] : ['search', '=', trimmed],
    fields: CHARACTER_FIELDS,
    sort: isId ? 'id' : 'searchrank',
    results: Math.min(results, 100),
  }, isId ? TTL.characterById : TTL.staff);
  return r.results;
}

// Staff
export interface VndbStaff {
  id: string;
  aid: number;
  ismain: boolean;
  name: string;
  original: string | null;
  lang: string | null;
  gender: string | null;
  description: string | null;
  extlinks: { url: string; label: string; name: string }[];
}

export async function searchStaff(query: string, { results = 30, mainOnly = true } = {}): Promise<VndbStaff[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const isId = /^s\d+$/i.test(trimmed);
  const filter = isId
    ? (['and', ['id', '=', trimmed.toLowerCase()], mainOnly ? ['ismain', '=', 1] : null].filter(Boolean) as unknown[])
    : (['and', ['search', '=', trimmed], mainOnly ? ['ismain', '=', 1] : null].filter(Boolean) as unknown[]);
  const r = await vndbPost<VndbResponse<VndbStaff>>('/staff', {
    filters: filter.length === 2 ? filter[1] : filter,
    fields: STAFF_FIELDS,
    sort: isId ? 'id' : 'searchrank',
    results: Math.min(results, 100),
  }, TTL.staff);
  return r.results;
}

export async function getStaff(id: string): Promise<VndbStaff | null> {
  const r = await vndbPost<VndbResponse<VndbStaff>>('/staff', {
    filters: ['and', ['id', '=', id], ['ismain', '=', 1]],
    fields: STAFF_FIELDS,
    results: 1,
  }, TTL.staff);
  return r.results[0] ?? null;
}

// Tag
export interface VndbTag {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  category: 'cont' | 'ero' | 'tech';
  searchable: boolean;
  applicable: boolean;
  vn_count: number;
}

export async function searchTags(query: string, { results = 50, category }: { results?: number; category?: string } = {}): Promise<VndbTag[]> {
  const trimmed = query.trim();
  const isId = /^g\d+$/i.test(trimmed);
  const filters: unknown[] = ['and'];
  if (trimmed) {
    filters.push(isId ? ['id', '=', trimmed.toLowerCase()] : ['search', '=', trimmed]);
  }
  if (category) filters.push(['category', '=', category]);
  const final = filters.length > 1 ? filters : [];
  const r = await vndbPost<VndbResponse<VndbTag>>('/tag', {
    filters: final.length ? final : undefined,
    fields: TAG_FIELDS,
    sort: trimmed && !isId ? 'searchrank' : 'vn_count',
    reverse: !(trimmed && !isId),
    results: Math.min(results, 100),
  }, TTL.tag);
  return r.results;
}

export async function getTag(id: string): Promise<VndbTag | null> {
  const r = await vndbPost<VndbResponse<VndbTag>>('/tag', {
    filters: ['id', '=', id],
    fields: TAG_FIELDS,
    results: 1,
  }, TTL.tag);
  return r.results[0] ?? null;
}

// Trait
export interface VndbTrait {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  searchable: boolean;
  applicable: boolean;
  sexual: boolean;
  group_id: string | null;
  group_name: string | null;
  char_count: number;
}

export async function searchTraits(query: string, { results = 50 } = {}): Promise<VndbTrait[]> {
  const trimmed = query.trim();
  const isId = /^i\d+$/i.test(trimmed);
  const r = await vndbPost<VndbResponse<VndbTrait>>('/trait', {
    filters: trimmed ? (isId ? ['id', '=', trimmed.toLowerCase()] : ['search', '=', trimmed]) : undefined,
    fields: TRAIT_FIELDS,
    sort: trimmed && !isId ? 'searchrank' : 'char_count',
    reverse: !(trimmed && !isId),
    results: Math.min(results, 100),
  }, TTL.trait);
  return r.results;
}

// Release
export interface VndbReleaseLanguage {
  lang: string;
  title: string | null;
  latin: string | null;
  mtl: boolean;
  main: boolean;
}

export interface VndbRelease {
  id: string;
  title: string;
  alttitle: string | null;
  languages: VndbReleaseLanguage[];
  platforms: string[];
  media: { medium: string; qty: number }[];
  released: string | null;
  minage: number | null;
  patch: boolean;
  freeware: boolean;
  uncensored: boolean | null;
  official: boolean;
  has_ero: boolean;
  resolution: [number, number] | string | null;
  engine: string | null;
  voiced: number | null;
  notes: string | null;
  gtin: string | null;
  catalog: string | null;
  producers: { id: string; name: string; developer: boolean; publisher: boolean }[];
  extlinks: { url: string; label: string; name: string; id?: string | number }[];
  vns: { id: string; rtype: 'trial' | 'partial' | 'complete' }[];
  images: VndbReleaseImage[];
}

export interface VndbReleaseImage {
  id: string;
  url: string;
  thumbnail?: string;
  dims?: [number, number];
  sexual?: number;
  violence?: number;
  type: 'pkgfront' | 'pkgback' | 'pkgcontent' | 'pkgside' | 'pkgmed' | 'dig';
  languages?: string[] | null;
  photo?: boolean;
  vn?: string | null;
}

export async function getReleasesForVn(vnId: string, max = 50): Promise<VndbRelease[]> {
  const r = await vndbPost<VndbResponse<VndbRelease>>('/release', {
    filters: ['vn', '=', ['id', '=', vnId]],
    fields: RELEASE_FIELDS,
    sort: 'released',
    results: Math.min(max, 100),
  }, TTL.releases);
  return r.results;
}

export async function getRelease(id: string): Promise<VndbRelease | null> {
  const r = await vndbPost<VndbResponse<VndbRelease>>('/release', {
    filters: ['id', '=', id],
    fields: RELEASE_FIELDS,
    results: 1,
  }, TTL.releaseById);
  return r.results[0] ?? null;
}

// Quote
export interface VndbQuote {
  id: string;
  quote: string;
  score: number;
  vn: { id: string; title: string } | null;
  character: { id: string; name: string; original: string | null } | null;
}

export async function getRandomQuote(): Promise<VndbQuote | null> {
  // Bypass cache — random must vary on every call.
  const r = await vndbPost<VndbResponse<VndbQuote>>('/quote', {
    filters: ['random', '=', 1],
    fields: QUOTE_FIELDS,
  }, TTL.quotesRandom);
  return r.results[0] ?? null;
}

export async function getQuotesForVn(vnId: string, { results = 20 } = {}): Promise<VndbQuote[]> {
  const r = await vndbPost<VndbResponse<VndbQuote>>('/quote', {
    filters: ['vn', '=', ['id', '=', vnId]],
    fields: QUOTE_FIELDS,
    sort: 'score',
    reverse: true,
    results: Math.min(results, 100),
  }, TTL.quotesByVn);
  return r.results;
}

// Schema + stats + auth + user
export interface VndbStatsGlobal {
  chars: number;
  producers: number;
  releases: number;
  staff: number;
  tags: number;
  traits: number;
  vn: number;
}

export async function getGlobalStats(): Promise<VndbStatsGlobal> {
  return vndbGet<VndbStatsGlobal>('/stats', TTL.stats);
}

export interface VndbAuthInfo {
  id: string;
  username: string;
  permissions: string[];
}

export async function getAuthInfo(): Promise<VndbAuthInfo | null> {
  const token = process.env.VNDB_TOKEN;
  if (!token) return null;
  try {
    return await vndbGet<VndbAuthInfo>('/authinfo', TTL.authInfo);
  } catch {
    return null;
  }
}

export async function getSchema(): Promise<unknown> {
  return vndbGet<unknown>('/schema', TTL.schema);
}

export interface VndbUserInfo {
  id: string;
  username: string;
  lengthvotes?: number;
  lengthvotes_sum?: number;
}

export async function lookupUsers(qs: string[]): Promise<Record<string, VndbUserInfo | null>> {
  const params = new URLSearchParams();
  for (const q of qs) params.append('q', q);
  params.set('fields', 'lengthvotes,lengthvotes_sum');
  return vndbGet<Record<string, VndbUserInfo | null>>(`/user?${params}`, TTL.user);
}
