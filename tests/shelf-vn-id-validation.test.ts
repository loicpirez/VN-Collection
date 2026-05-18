/**
 * R5-094 / R5-095 pin: shelf slot + display routes reject malformed
 * `vn_id` values (anything outside `v<digits>` or `egs_<digits>`).
 *
 * Source-pin only: the route source MUST contain a regex check on
 * `body.vn_id` BEFORE handing off to `placeShelfItem` /
 * `placeShelfDisplayItem`. The downstream helpers fail at the
 * `owned_release` lookup, but a strict shape check at the route
 * boundary keeps the contract symmetric with every other vn-id-
 * bearing route (`lists/[id]/items`, `reading-queue`,
 * `collection/order`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(__dirname, '..', rel), 'utf8');
}

const SLOTS = read('src/app/api/shelves/[id]/slots/route.ts');
const DISPLAYS = read('src/app/api/shelves/[id]/displays/route.ts');

describe('shelf API routes — vn_id validation (R5-094 / R5-095)', () => {
  it('slots/route.ts validates vn_id against /^(v\\d+|egs_\\d+)$/i', () => {
    expect(SLOTS).toMatch(/\/\^\(v\\d\+\|egs_\\d\+\)\$\/i\.test\(body\.vn_id\)/);
    expect(SLOTS).toMatch(/error: 'invalid vn_id'/);
  });

  it('displays/route.ts validates vn_id against /^(v\\d+|egs_\\d+)$/i', () => {
    expect(DISPLAYS).toMatch(/\/\^\(v\\d\+\|egs_\\d\+\)\$\/i\.test\(body\.vn_id\)/);
    expect(DISPLAYS).toMatch(/error: 'invalid vn_id'/);
  });

  it('slots/route.ts checks vn_id BEFORE release_id (so error message is meaningful)', () => {
    const vnIdx = SLOTS.indexOf("'invalid vn_id'");
    const relIdx = SLOTS.indexOf("'invalid release_id'");
    expect(vnIdx).toBeGreaterThan(0);
    expect(relIdx).toBeGreaterThan(0);
    expect(vnIdx).toBeLessThan(relIdx);
  });

  it('displays/route.ts checks vn_id BEFORE release_id', () => {
    const vnIdx = DISPLAYS.indexOf("'invalid vn_id'");
    const relIdx = DISPLAYS.indexOf("'invalid release_id'");
    expect(vnIdx).toBeGreaterThan(0);
    expect(relIdx).toBeGreaterThan(0);
    expect(vnIdx).toBeLessThan(relIdx);
  });

  it('both routes carry an R5-094 / R5-095 comment so future maintainers know why', () => {
    expect(SLOTS).toMatch(/R5-094/);
    expect(DISPLAYS).toMatch(/R5-095/);
  });
});
