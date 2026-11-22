/** Scope shared by credit views with active and archived collection records. */
export type WorksScope = 'all' | 'collection' | 'sold';

export function parseWorksScope(value: string | string[] | null | undefined): WorksScope {
  const scope = Array.isArray(value) ? value[0] : value;
  return scope === 'collection' || scope === 'sold' ? scope : 'all';
}
