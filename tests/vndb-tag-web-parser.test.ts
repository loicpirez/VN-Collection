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
});
