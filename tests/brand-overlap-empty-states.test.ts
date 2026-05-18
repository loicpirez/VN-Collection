/**
 * R5-110 pin: `/brand-overlap` empty-state copy explains the
 * cache/data gap AND points back to each producer page so the
 * user can trigger the context-specific staff fan-out (not the
 * global refresh).
 *
 * The page has three empty states:
 *   1. `pickHint` — when neither producer is selected.
 *   2. `needsMoreData` — when the producer staff cache is too
 *      sparse to find overlap. Linked to both producers.
 *   3. `empty` — when the result set is genuinely zero (data
 *      sufficient, no shared collaborators). Linked to both
 *      producers as a "review credits" next step.
 *
 * The refresh path is intentionally NOT a button on this page —
 * staff downloads are per-producer (via `/producer/[id]`'s own
 * refresh / per-VN fan-out). Putting a global "Refresh staff"
 * here would either duplicate that surface or fan-out across
 * all producers.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/app/brand-overlap/page.tsx'),
  'utf8',
);

describe('R5-110 — /brand-overlap empty states', () => {
  it('needsMoreData branch links to both producer pages', () => {
    expect(SOURCE).toMatch(/needsMoreData/);
    // Both producers receive a link inside that branch.
    const branch = SOURCE.match(/needsMoreData[\s\S]*?<\/div>/);
    expect(branch).not.toBeNull();
    expect(branch![0]).toMatch(/href=\{`\/producer\/\$\{a\}`/);
    expect(branch![0]).toMatch(/href=\{`\/producer\/\$\{b\}`/);
  });

  it('zero-result branch links to both producer pages', () => {
    // The `entries.length === 0` branch follows the result
    // header; we anchor on the empty text key.
    const branch = SOURCE.match(/entries\.length === 0[\s\S]*?<\/div>/);
    expect(branch).not.toBeNull();
    expect(branch![0]).toMatch(/t\.brandOverlap\.empty/);
    expect(branch![0]).toMatch(/href=\{`\/producer\/\$\{a\}`/);
    expect(branch![0]).toMatch(/href=\{`\/producer\/\$\{b\}`/);
  });

  it('the page never POSTs to /api/refresh/global', () => {
    expect(SOURCE).not.toMatch(/\/api\/refresh\/global/);
  });
});
