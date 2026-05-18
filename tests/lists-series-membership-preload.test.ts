/**
 * R5-114 / R5-115 — pin that `/lists/[id]` and `/series/[id]`
 * preload the ListsPicker membership-count chip via
 * `countListMembershipsByVn()` instead of letting the
 * `ListsPickerButton` mount with 0 and fetch the count on popover-
 * open.
 *
 * Source-level pins are enough: the helper is a pure DB read with
 * its own focused test, and the call sites just need to wire its
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

  it('imports countListMembershipsByVn from @/lib/db', () => {
    expect(src).toMatch(/\bcountListMembershipsByVn\b[^;]*from\s+['"]@\/lib\/db['"]/s);
  });

  it('calls countListMembershipsByVn() exactly once and stuffs the map into the per-card data', () => {
    expect(src).toMatch(/countListMembershipsByVn\(\)/);
    // The `listCard` call site must receive a `listCount` arg
    // sourced from the map.
    expect(src).toMatch(/listCounts\.get\(it\.vn_id\)/);
  });

  it('listCardData accepts a listCount parameter and forwards it to CardData', () => {
    // Slice from `function listCardData(` to the matching closing
    // paren of the signature (the last `): CardData {`).
    const sig = src.match(/function\s+listCardData\([\s\S]*?\)\s*:\s*CardData\s*\{/);
    expect(sig).not.toBeNull();
    expect(sig![0]).toMatch(/listCount\s*:\s*number/);
    // And the resulting CardData includes the field.
    expect(src).toMatch(/listCount,?\s*\n/);
  });
});

describe('/series/[id] — R5-115 preloads listCount', () => {
  const src = readFileSync(join(ROOT, 'src/app/series/[id]/page.tsx'), 'utf8');

  it('imports countListMembershipsByVn from @/lib/db', () => {
    expect(src).toMatch(/\bcountListMembershipsByVn\b[^;]*from\s+['"]@\/lib\/db['"]/s);
  });

  it('annotates list_count on each item before toCardData', () => {
    // The series page reuses the shared CollectionItem-typed
    // `toCardData` projector, which reads `it.list_count`. The
    // page must therefore annotate that field on every row
    // before mapping.
    expect(src).toMatch(/list_count:\s*listCounts\.get\(/);
  });
});
