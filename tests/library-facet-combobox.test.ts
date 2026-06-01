import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';

const COMPONENT = readFileSync('src/components/library/FacetCombobox.tsx', 'utf8');
const LIBRARY = readFileSync('src/components/LibraryClient.tsx', 'utf8');

describe('library high-cardinality facet comboboxes', () => {
  it('renders an accessible bounded searchable listbox', () => {
    expect(COMPONENT).toContain('const MAX_VISIBLE_OPTIONS = 60');
    expect(COMPONENT).toContain('role="combobox"');
    expect(COMPONENT).toContain('aria-autocomplete="list"');
    expect(COMPONENT).toContain('role="listbox"');
    expect(COMPONENT).toContain('role="option"');
    expect(COMPONENT).toContain("replace('{shown}', String(visible.length))");
    expect(COMPONENT).toContain("replace('{total}', String(matching.length))");
  });

  it('uses searchable facets for every long library option set', () => {
    expect(LIBRARY.match(/<FacetCombobox/g)).toHaveLength(5);
    expect(LIBRARY).toContain('options={developerFacetOptions}');
    expect(LIBRARY).toContain('options={publisherFacetOptions}');
    expect(LIBRARY).toContain('options={seriesFacetOptions}');
    expect(LIBRARY).toContain('options={tagFacetOptions}');
    expect(LIBRARY).toContain('options={placeFacetOptions}');
    expect(LIBRARY).toContain('setCollectionTags(tagData)');
    expect(LIBRARY).not.toContain('.slice(0, 200)');
  });

  it('provides result-count copy in every locale', () => {
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const library = dictionaries[locale].library;
      expect(library.facetSearchPlaceholder.trim().length).toBeGreaterThan(0);
      expect(library.facetAll.trim().length).toBeGreaterThan(0);
      expect(library.facetResults).toContain('{shown}');
      expect(library.facetResults).toContain('{total}');
      expect(library.facetNoResults.trim().length).toBeGreaterThan(0);
    }
  });
});
