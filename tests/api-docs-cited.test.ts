/**
 * R5-216 pin: subtle KANA / EGS quirks are explicitly cited in
 * code comments so a future contributor reading
 * `vndb.ts:fetchTopVnsByTag`, `getCharactersForTrait`,
 * `scrape-tag-dag.ts`, or `erogamescape.ts` doesn't have to
 * re-derive the spec from the wire.
 *
 * The pin scans the relevant files for three specific subtle
 * behaviours the row called out:
 *   1. Tag filter tuple order — the KANA.md example `["g505",
 *      2, 1.2]` shape (tag id, maxSpoiler, minTagLevel).
 *   2. VNDB hierarchy gap — the Kana API has no parent/child
 *      relationship surface, which is why we scrape `/g{id}`.
 *   3. EGS constraints — the `sql_for_erogamer_form.php`
 *      endpoint quirks (POST required, HTML-only response,
 *      ~10k row cap, lowercase columns).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('R5-216 — KANA / EGS subtle quirks cited in code comments', () => {
  it('vndb.ts:fetchTopVnsByTag documents the (tag id, maxSpoiler, minTagLevel) tuple order', () => {
    const src = readFileSync(join(ROOT, 'src/lib/vndb.ts'), 'utf8');
    expect(src).toMatch(/Order per KANA\.md example/);
    expect(src).toMatch(/maxSpoiler\s*\(integer/);
    expect(src).toMatch(/minTagLevel\s*\(float/);
  });

  it('vndb.ts:getCharactersForTrait documents the trait filter tuple shape', () => {
    const src = readFileSync(join(ROOT, 'src/lib/vndb.ts'), 'utf8');
    expect(src).toMatch(/R5-216:.*trait filter tuple order per KANA\.md/);
  });

  it('scrape-tag-dag.ts documents why the hierarchy is scraped (KANA gap)', () => {
    const src = readFileSync(join(ROOT, 'src/lib/scrape-tag-dag.ts'), 'utf8');
    expect(src).toMatch(/R5-216:.*VNDB hierarchy gap/);
    expect(src).toMatch(/parent\s*\/\s*child relationship/);
  });

  it('erogamescape.ts documents the SQL form constraints', () => {
    const src = readFileSync(join(ROOT, 'src/lib/erogamescape.ts'), 'utf8');
    expect(src).toMatch(/R5-216:.*EGS constraints/);
    expect(src).toMatch(/sql_for_erogamer_form\.php/);
    expect(src).toMatch(/REQUIRES POST/);
    expect(src).toMatch(/HTML table/);
    expect(src).toMatch(/lowercase/);
  });
});
