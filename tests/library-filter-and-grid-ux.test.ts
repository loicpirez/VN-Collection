import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('library filters and grid UX', () => {
  it('supports tri-state filtering for VNs that belong to personal lists', () => {
    const src = source('src/components/LibraryClient.tsx');
    expect(src).toContain("const urlInList = searchParams.get('in_list')");
    expect(src).toContain('!ternaryMatches(urlInList, it.list_count > 0)');
    const moreFilters = source('src/components/library/MoreFilters.tsx');
    expect(src + moreFilters).toContain("{ key: 'in_list', label: t.nav.lists }");
  });

  it('standardizes search and wishlist card grid gaps to the library rhythm', () => {
    expect(source('src/components/SearchClient.tsx')).toContain('className="grid gap-3"');
    expect(source('src/components/WishlistClient.tsx')).toContain('className="grid gap-3"');
  });

  it('shows a skeleton instead of an empty-state flash when search opens with a query', () => {
    expect(source('src/components/SearchClient.tsx')).toContain('useState(!!initialQ || isAdvActive(initialAdv))');
  });

  it('loads and caches advanced facets only when the filter drawer opens', () => {
    const src = source('src/components/LibraryClient.tsx');
    expect(src).toContain('const facetsFetchedRef = useRef(false)');
    expect(src).toContain('const requestFacets = useCallback(() => {');
    expect(src).toContain('if (facetsFetchedRef.current || facetsAbortRef.current) return');
    expect(src).toContain('onOpen={requestFacets}');
    expect(src).not.toContain('if (facetsFetchedRef.current) return;\n    facetsFetchedRef.current = true;');
  });
});
