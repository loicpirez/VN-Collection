/**
 * R5-114 / R5-115 — pin that `/lists/[id]` and `/series/[id]`
 * preload the ListsPicker membership-count chip via the
 * provider-neutral collection-list repository instead of letting the
 * `ListsPickerButton` mount with 0 and fetch the count on popover-
 * open.
 *
 * Source-level pins are enough: the repository method has focused
 * SQLite/PostgreSQL contracts, and the call sites just need to wire its
 * output into the per-card `listCount` projection. The behaviour
 * (the chip shows the right number on first paint) is exercised by
 * the existing component tests / Playwright pass when needed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('/lists/[id] — R5-114 preloads listCount', () => {
  const src = readFileSync(join(ROOT, 'src/app/lists/[id]/page.tsx'), 'utf8');

  it('selects the provider-neutral collection-list repository', () => {
    expect(src).toContain("import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';");
    expect(src).toContain('const collectionRepository = getCollectionListRepository();');
  });

  it('loads membership counts once and projects them into each card', () => {
    expect(src.match(/collectionRepository\.listMembershipCounts\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/listCounts\.get\(it\.vn_id\)/);
  });

  it('annotates list_count before the shared CardData projection', () => {
    expect(src).toMatch(/toCardData\(\{[\s\S]*?list_count:\s*listCounts\.get\(it\.vn_id\)\s*\?\?\s*0/);
  });
});

describe('/series/[id] — R5-115 preloads listCount', () => {
  const src = readFileSync(join(ROOT, 'src/app/series/[id]/page.tsx'), 'utf8');

  it('selects the provider-neutral collection-list repository', () => {
    expect(src).toContain("import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';");
    expect(src).toContain('const collectionRepository = getCollectionListRepository();');
  });

  it('annotates list_count on each item before toCardData', () => {
    // The series page reuses the shared CollectionItem-typed
    // `toCardData` projector, which reads `it.list_count`. The
    // page must therefore annotate that field on every row
    // before mapping.
    expect(src.match(/collectionRepository\.listMembershipCounts\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/list_count:\s*listCounts\.get\(/);
  });
});
