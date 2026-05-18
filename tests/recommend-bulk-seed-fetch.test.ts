/**
 * R5-140 / R5-142 source-level pin.
 *
 * R5-140: `buildSeedUnion` in `src/lib/recommend.ts` no longer issues
 *         per-VN `SELECT … FROM vn WHERE id = ?` inside the seed
 *         touch() loop. The function bulk-fetches every candidate
 *         VN with a single `WHERE id IN (…)` chunked query and reads
 *         from an in-memory Map for the per-event work.
 *
 * R5-142: `src/app/release/[id]/page.tsx` and
 *         `src/app/api/series/[id]/vn/[vnId]/route.ts` replaced
 *         per-row `isInCollection` calls inside their loops with one
 *         batched `isInCollectionMany` lookup so the cost is O(1)
 *         round-trips, not O(N).
 *
 * The existing recommend test suite (recommend-modes, broadening,
 * owned-badge, similar-to-vn-empty) is the behavioural gate; this
 * file pins the *shape* of the optimisation so a future revert can't
 * silently regress the N+1 pattern without a CI failure.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}
function codeOnly(src: string): string {
  return stripLineComments(stripBlockComments(src));
}

describe('R5-140 — recommend.ts buildSeedUnion bulk-fetches seed VN rows', () => {
  const src = readFileSync(join(ROOT, 'src/lib/recommend.ts'), 'utf8');
  const body = src.split('function buildSeedUnion')[1]?.split('\nfunction ')[0] ?? '';
  const code = codeOnly(body);

  it('no per-VN `WHERE id = ?` SELECT inside buildSeedUnion', () => {
    // The previous touch() body had:
    //   SELECT title, tags, developers, staff FROM vn WHERE id = ?
    // and ran it once per VN per signal. The refactor replaces it
    // with a single `WHERE id IN (...)` chunked query before the
    // touch() loop, so this exact per-row shape must not return.
    expect(code).not.toMatch(/FROM\s+vn\s+WHERE\s+id\s*=\s*\?/i);
  });

  it('bulk `WHERE id IN (...)` query covers the candidate VN set', () => {
    expect(code).toMatch(/WHERE\s+id\s+IN\s*\(/i);
  });

  it('rowsById Map is the source of truth inside touch()', () => {
    // touch() must read from the prebuilt Map, not the DB, so the
    // optimisation is real.
    expect(code).toMatch(/rowsById\.get\(/);
  });
});

describe('R5-142 — isInCollectionMany sweep in release page + series route', () => {
  it('release/[id]/page.tsx uses isInCollectionMany, not per-row isInCollection', () => {
    const src = readFileSync(join(ROOT, 'src/app/release/[id]/page.tsx'), 'utf8');
    const code = codeOnly(src);
    expect(code).toMatch(/isInCollectionMany\(/);
    // The previous `.filter((v) => isInCollection(v.id))` shape must
    // not survive — the call-graph for a release with many linked
    // VNs is the entire reason for the batched lookup.
    expect(code).not.toMatch(/\.filter\(\([^)]*\)\s*=>\s*isInCollection\(/);
  });

  it('series/[id]/vn/[vnId]/route.ts uses isInCollectionMany for the relation expand loop', () => {
    const src = readFileSync(join(ROOT, 'src/app/api/series/[id]/vn/[vnId]/route.ts'), 'utf8');
    const code = codeOnly(src);
    expect(code).toMatch(/isInCollectionMany\(/);
    // The expand loop iterates the relation graph; per-row
    // isInCollection() inside the loop body is the regression.
    const expandBlock = code.split('body.expand')[1]?.split('}\n  try {')[0] ?? '';
    expect(expandBlock).not.toMatch(/isInCollection\(/);
  });
});
