import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVndbTagHomeTree, parseVndbTagWebDetail } from '../src/lib/vndb-tag-web-parser';

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8');
}

describe('VNDB tag web parser', () => {
  it('parses the VNDB tag home hierarchy, counts, and more-tags rows', () => {
    const tree = parseVndbTagHomeTree(fixture('vndb-tag-home.html'));
    expect(tree.groups.map((g) => g.label)).toEqual(['Theme', 'Character', 'Style', 'Plot', 'Setting']);
    const theme = tree.groups[0];
    expect(theme.children.map((c) => c.name)).toContain('Fantasy');
    expect(theme.children.find((c) => c.id === 'g2')?.count).toBe(12730);
    expect(theme.moreCount).toBe(7);
    expect(tree.popular.map((t) => t.name)).toContain('Male Protagonist');
    expect(tree.recentlyAdded[0]).toMatchObject({ id: 'g4171', name: 'Hero Brothers', dateLabel: '12 days ago' });
    expect(tree.recentlyTaggedHref).toBe('/g/links');
  });

  it('parses tag detail breadcrumbs and grouped child tags', () => {
    const detail = parseVndbTagWebDetail(fixture('vndb-tag-detail-g2.html'), 'g2');
    expect(detail.name).toBe('Fantasy');
    expect(detail.breadcrumb.map((c) => c.name)).toEqual(['Tags', 'Theme', 'Fantasy']);
    expect(detail.descriptionText).toContain('fantasy genre');
    expect(detail.categoryLabel).toBe('Content');
    expect(detail.childGroups.map((g) => g.title)).toEqual(['Fictional Beings', 'Magic', 'Child tags']);
    expect(detail.childGroups[0].children.find((c) => c.id === 'g492')?.count).toBe(3047);
  });

  it('keeps deep breadcrumbs even when a tag has no child groups', () => {
    const detail = parseVndbTagWebDetail(fixture('vndb-tag-detail-g578.html'), 'g578');
    expect(detail.name).toBe("Protagonist's Kouhai as a Heroine");
    expect(detail.breadcrumb.map((c) => c.name)).toEqual([
      'Tags',
      'Character',
      'Heroine',
      "Heroine's Role/Vocation",
      "Heroine's Relation",
      "Protagonist's Kouhai as a Heroine",
    ]);
    expect(detail.aliases).toContain("Protagonist's Underclassman as a Heroine");
    expect(detail.childGroups).toEqual([]);
  });

  it('returns empty home sections for missing or unclosed tag-tree markup', () => {
    expect(parseVndbTagHomeTree('')).toEqual({
      groups: [],
      recentlyAdded: [],
      popular: [],
      recentlyTaggedHref: null,
    });
    expect(parseVndbTagHomeTree('<ul class="tagtree"><li><a href="/g1">Open</a></li>')).toMatchObject({
      groups: [],
    });
  });

  it('skips malformed tree members, deduplicates simple lists, and parses huge counts as null', () => {
    const huge = '9'.repeat(1000);
    const tree = parseVndbTagHomeTree(`
      <ul class="tagtree">
        </li>
        <li>missing link</li>
        <li><a href="/g1">Valid</a><small>(${huge})</small></li>
        <li><a href="/g2">Open item</a>
      </ul>
      <h1>Recently added</h1>
        <a href="/g3">First</a>
        <a href="/g3">Duplicate</a>
      </article>
      <h1>Popular</h1>
        <a href="/g4">Popular</a>
      </article>
    `);
    expect(tree.groups).toEqual([{ id: 'g1', label: 'Valid', href: '/tag/g1?tab=vndb', children: [], moreCount: null }]);
    expect(tree.groups[0]?.children).toEqual([]);
    expect(tree.recentlyAdded).toHaveLength(1);
    expect(tree.popular).toHaveLength(1);
  });

  it('treats an unclosed nested list as an empty child list and parses a heading without an article close', () => {
    const tree = parseVndbTagHomeTree(`
      <ul class="tagtree">
        <li><a href="/g1">Parent</a><ul></li></ul></ul>
      <h1>Popular</h1>
        <a href="/g2">Popular without article close</a>
    `);
    expect(tree.groups[0]?.children).toEqual([]);
    expect(tree.popular).toHaveLength(1);
  });

  it('uses detail fallbacks and parses each searchable and applicable state', () => {
    expect(parseVndbTagWebDetail('', 'G9')).toEqual({
      id: 'g9',
      name: 'g9',
      breadcrumb: [],
      descriptionText: null,
      properties: { searchable: null, applicable: null },
      categoryLabel: null,
      aliases: [],
      childGroups: [],
    });
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1>', 'g10')).toMatchObject({
      name: 'Plain',
      breadcrumb: [],
    });
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1><p>Parent</p><p>not searchable and can not be directly applied</p>', 'g10').properties).toEqual({
      searchable: false,
      applicable: false,
    });
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1><p>Parent</p><p>searchable and directly applied</p>', 'g10').properties).toEqual({
      searchable: true,
      applicable: true,
    });
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1><p>Parent</p><p>cannot be directly applied</p>', 'g10').properties.applicable).toBe(false);
  });

  it('adds missing breadcrumb self links and leaves grouped-only children without a loose group', () => {
    const detail = parseVndbTagWebDetail(`
      <h1>Tag: Leaf</h1>
      <p>Tags <a href="/g1">Parent</a></p>
      <h1>Child tags</h1>
      <ul class="tagtree">
        <li><a href="/g2">Group</a>
          <ul><li><a href="/g3">Child</a></li></ul>
        </li>
      </ul>
      </article>
    `, 'g9');
    expect(detail.breadcrumb.at(-1)).toEqual({ id: 'g9', name: 'Leaf', href: null });
    expect(detail.childGroups).toEqual([{
      title: 'Group',
      children: [{ id: 'g3', name: 'Child', count: null, href: '/tag/g3?tab=vndb', children: [], moreCount: null }],
    }]);
  });

  it('tolerates an unclosed breadcrumb paragraph', () => {
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1><p>Tags', 'g10').breadcrumb).toEqual([]);
  });

  it('does not append a duplicate self breadcrumb', () => {
    expect(parseVndbTagWebDetail('<h1>Tag: Plain</h1><p><a href="/g10">Plain</a></p>', 'g10').breadcrumb).toEqual([
      { id: 'g10', name: 'Plain', href: '/tag/g10?tab=vndb' },
    ]);
  });
});
